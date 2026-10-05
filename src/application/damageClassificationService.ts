import { CedexRepository, DamageVisualRule } from "../infrastructure/d1/cedexRepository";

const MODEL="@cf/qwen/qwen3.8-27b";
const MAX_COMPLETION_TOKENS=1200;
const DAMAGE_REVIEW_THRESHOLD=0.8;
const PAA_DISCONTINUITY_TRIGGER_CODES=new Set(["CO","PF","GD","DT"]);
type AiRunner={run(model:string,input:unknown):Promise<unknown>};
type Bucket={get(key:string):Promise<{arrayBuffer():Promise<ArrayBuffer>}|null>};
type AnalysisStatus="SUGGESTED"|"ABSTAINED"|"INCOMPLETE"|"INVALID_RESPONSE";
type Candidate={code:string;confidence:number|null;reason:string};

function dataUri(bytes:ArrayBuffer,type:string){
  let binary="";const data=new Uint8Array(bytes);
  for(let i=0;i<data.length;i+=0x8000)binary+=String.fromCharCode(...data.subarray(i,i+0x8000));
  return `data:${type||"image/jpeg"};base64,${btoa(binary)}`;
}
function record(value:unknown):Record<string,unknown>|null{
  return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function parseJson(raw:unknown):Record<string,unknown>|null{
  const envelope=record(raw);
  const first=Array.isArray(envelope?.choices)?record(envelope.choices[0]):null;
  const message=record(first?.message);
  const values=first?[message?.content]:[raw,envelope?.response,envelope?.result,envelope?.output_text];
  for(const value of values){
    const object=record(value);
    if(object&&Object.hasOwn(object,"selected_code"))return object;
    if(typeof value!=="string")continue;
    const text=value.trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
    try{
      const parsed=record(JSON.parse(text));
      if(parsed)return parsed;
    }catch{}
  }
  return null;
}
function validConfidence(value:unknown):value is number|null{
  return value===null||(typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=1);
}
function confidence(value:number|null):number|null{
  return value===null?null:value;
}
function formatDamageVisualGuidance(rules:DamageVisualRule[]){
  if(!rules.length){
    return "No additional D1 damage visual guidance is loaded. Use only the verified allowed-code names and visible evidence.";
  }
  const lines=rules.map(rule=>{
    const parts=[`${rule.damage_code}: ${rule.visual_definition}`];
    if(rule.positive_cues)parts.push(`Cues=${rule.positive_cues}`);
    if(rule.negative_cues)parts.push(`Avoid=${rule.negative_cues}`);
    if(rule.confusable_with)parts.push(`Vs=${rule.confusable_with}`);
    parts.push(`Evidence=${rule.evidence_requirement}`);
    if(rule.force_review===1)parts.push("Review=required");
    return parts.join(" | ");
  });
  return `Damage visual QA rules:\n${lines.join("\n")}`;
}

function selectedDamageRule(rules:DamageVisualRule[],code:string|null){
  if(!code)return null;
  return rules.find(rule=>rule.damage_code===code)??null;
}

function photoEligibleRules(rules:DamageVisualRule[]){
  return rules.filter(rule=>
    rule.evidence_requirement==="VISUAL"||
    (rule.damage_code==="IR"&&rule.evidence_requirement==="HISTORY_CONTEXT")
  );
}


export class DamageClassificationService{
  constructor(private readonly repo:CedexRepository,private readonly bucket:Bucket,private readonly ai:AiRunner){}

  async analyse(findingId:string){
    const context=await this.repo.findingContext(findingId);
    if(!context)throw new Error("Finding not found.");

    const allowed=await this.repo.damageCodesForFinding(findingId);
    if(!allowed.damages.length)throw new Error("No verified IICL damage rules are loaded for the confirmed component.");

    const photo=await this.repo.findingPhoto(findingId,"DAMAGE_CLOSEUP");
    if(!photo)throw new Error("Damage close-up photo is required.");

    const object=await this.bucket.get(photo.r2_key);
    if(!object)throw new Error("Damage close-up photo is unavailable.");

    const targetPoint=await this.repo.surveyorComponentPoint(findingId,photo.id);
    const image=dataUri(await object.arrayBuffer(),photo.content_type);

    const targetCropPhoto=await this.repo.findingPhoto(findingId,"COMPONENT_CLOSEUP");
    let targetCropImage:string|null=null;
    if(targetCropPhoto){
      const targetCropObject=await this.bucket.get(targetCropPhoto.r2_key);
      if(targetCropObject)targetCropImage=dataUri(await targetCropObject.arrayBuffer(),targetCropPhoto.content_type);
    }

    const allowedCodes=[...new Set(allowed.damages.map(x=>x.damage_code))];
    const allowedSet=new Set(allowedCodes);
    const allowedText=allowed.damages.map(x=>`${x.damage_code} = ${x.damage_name}`).join("\n");
    if(!["GP","RF"].includes(context.equipment_type))throw new Error("Unable to determine GP/RF equipment type.");
    const equipment=context.equipment_type as "GP"|"RF";
    const visualRules=(await this.repo.damageVisualRules(equipment,allowed.componentCode))
      .filter(rule=>allowedSet.has(rule.damage_code));
    const photoRules=photoEligibleRules(visualRules);
    const photoRuleCodes=new Set(photoRules.map(rule=>rule.damage_code));
    const aiAllowedDamages=photoRules.length
      ? allowed.damages.filter(x=>photoRuleCodes.has(x.damage_code))
      : allowed.damages;
    const aiAllowedCodes=[...new Set(aiAllowedDamages.map(x=>x.damage_code))];
    const aiAllowedSet=new Set(aiAllowedCodes);
    const aiAllowedText=aiAllowedDamages.map(x=>`${x.damage_code} = ${x.damage_name}`).join("\n");
    const visualGuidance=formatDamageVisualGuidance(photoRules.length?photoRules:visualRules);

    const prompt=`You are assisting a shipping-container surveyor using the verified IICL damage-code list supplied by the application.
Confirmed component: ${allowed.componentCode}. Container face: ${context.container_face}.
${targetPoint?`The surveyor pinpointed the intended damage on the close-up image at normalized coordinates from the top-left: x=${targetPoint.x.toFixed(4)}, y=${targetPoint.y.toFixed(4)}. Treat the damage at this point as the PRIMARY target and use the surrounding close-up morphology as context. The coordinates are metadata only; no artificial marker is drawn on the pixels.`:"No close-up target point is available; classify cautiously."}

Classify ONLY the visible physical damage affecting the confirmed component. Choose ONLY from the allowed codes below. Never invent a code.
Use the physical morphology at the pinpointed target and its immediate surrounding close-up context. Do not classify unrelated dirt, stains, corrosion, marks or defects elsewhere in the image.
Identify the PRIMARY damage at the pinpointed target. Incidental paint chips, dirt, staining or discoloration caused by or adjacent to a clearer structural damage must not outrank the primary morphology.
${equipment==="GP"&&allowed.componentCode==="PAA"?`For GP/PAA use this morphology priority when evidence overlaps:
1. A true material discontinuity at the pinpoint (crack/fracture or sharp cut/opening) outranks generic dent/deformation. Use CK for a fracture/split line; use CU for a sharp incision, severed edge or cut penetration.
2. If there is no true discontinuity but the panel profile is permanently displaced, buckled, bent or depressed, DT outranks incidental paint loss, rust staining, dirt or superficial abrasion.
3. Use PF, CO, DY or GD as the primary code only when that surface condition is itself the dominant morphology and there is no stronger structural break or deformation at the target.
Do not label CK/CU as DT merely because surrounding sheet metal is also bent. Do not label a clear DT as PF or CO merely because coating loss or corrosion appears on the deformed area.`:""}
Do not abstain merely because exact severity or repair measurement is unavailable: if the visible damage type itself is clear, return that damage code.
IR (Improper / Non-conforming repair) is a special photo-eligible exception: suggest IR only when the target visibly appears to be a previous repair (for example a patch, weld, inserted piece or repair workmanship) and always set needs_review true because the photo alone cannot prove IICL conformity.
Other codes whose evidence requirement is MEASUREMENT or HISTORY_CONTEXT remain excluded from the photo-only AI suggestion. If the image truly does not distinguish the damage type, return selected_code null and needs_review true.

${visualGuidance}

Photo-eligible damage codes for ${allowed.componentCode}:
${aiAllowedText}
Codes requiring measurement, history or broader context remain available for manual surveyor selection and are excluded from this photo-only AI suggestion, except IR when visible previous-repair evidence is present. IR always requires surveyor review.

Return only the final JSON object with selected_code (an allowed code or JSON null), confidence (0 to 1 or null), needs_review (boolean), reason (maximum 20 words), and candidates (at most 3 objects with code, confidence and a maximum 15-word reason). Keep the answer concise. Do not explain your reasoning outside the JSON.`;

    const content:Array<Record<string,unknown>>=[
      {type:"text",text:prompt},
      {type:"text",text:"Full close-up image: use this for the overall damage morphology and structural context."},
      {type:"image_url",image_url:{url:image}}
    ];
    if(targetCropImage){
      content.push(
        {type:"text",text:"Fine-reticle target crop: the cyan reticle centre marks the exact surveyor-selected damage. Use this to inspect the local morphology at the target; the reticle is an overlay, not physical damage."},
        {type:"image_url",image_url:{url:targetCropImage}}
      );
    }

    const raw=await this.ai.run(MODEL,{
      messages:[{role:"user",content}],
      max_completion_tokens:MAX_COMPLETION_TOKENS,
      reasoning_effort:"low",
      temperature:0,
      response_format:{
        type:"json_schema",
        json_schema:{
          name:"damage_classification",
          strict:true,
          schema:{
            type:"object",
            properties:{
              selected_code:{type:["string","null"],enum:[...aiAllowedCodes,null]},
              confidence:{type:["number","null"],minimum:0,maximum:1},
              needs_review:{type:"boolean"},
              reason:{type:"string"},
              candidates:{
                type:"array",maxItems:3,
                items:{
                  type:"object",
                  properties:{
                    code:{type:"string",enum:aiAllowedCodes},
                    confidence:{type:["number","null"],minimum:0,maximum:1},
                    reason:{type:"string"}
                  },
                  required:["code","confidence","reason"],
                  additionalProperties:false
                }
              }
            },
            required:["selected_code","confidence","needs_review","reason","candidates"],
            additionalProperties:false
          }
        }
      }
    });

    const envelope=record(raw);
    const choice=Array.isArray(envelope?.choices)?record(envelope.choices[0]):null;
    const finishReason=typeof choice?.finish_reason==="string"?choice.finish_reason:null;
    const parsed=parseJson(raw);

    let analysisStatus:AnalysisStatus="INVALID_RESPONSE";
    let selectedCode:string|null=null;
    let selectedConfidence:number|null=null;
    let needsReview=true;
    let reason="AI returned an unreadable damage answer. Retry analysis or select the damage manually.";
    let candidates:Candidate[]=[];

    if(finishReason==="length"){
      analysisStatus="INCOMPLETE";
      reason="AI response incomplete. Retry analysis or select the damage manually.";
    }else if((!finishReason||finishReason==="stop")&&!record(choice?.message)?.refusal&&parsed&&
      (parsed.selected_code===null||typeof parsed.selected_code==="string")&&
      validConfidence(parsed.confidence)&&typeof parsed.needs_review==="boolean"&&
      typeof parsed.reason==="string"&&Array.isArray(parsed.candidates)&&parsed.candidates.length<=3&&
      parsed.candidates.every(value=>{
        const candidate=record(value);
        return candidate&&typeof candidate.code==="string"&&validConfidence(candidate.confidence)&&typeof candidate.reason==="string";
      })){
      const code=typeof parsed.selected_code==="string"?parsed.selected_code.trim().toUpperCase():null;
      if(code===null||aiAllowedSet.has(code)){
        selectedCode=code;
        selectedConfidence=confidence(parsed.confidence);
        const rule=selectedDamageRule(visualRules,code);
        needsReview=
          parsed.needs_review||
          !code||
          selectedConfidence===null||
          selectedConfidence<DAMAGE_REVIEW_THRESHOLD||
          rule?.force_review===1;
        analysisStatus=code?"SUGGESTED":"ABSTAINED";
        reason=parsed.reason.trim()||(code?"Surveyor confirmation required.":"AI could not distinguish the visible damage type reliably.");
        for(const value of parsed.candidates){
          const candidate=value as {code:string;confidence:number|null;reason:string};
          const candidateCode=candidate.code.trim().toUpperCase();
          if(aiAllowedSet.has(candidateCode)&&!candidates.some(x=>x.code===candidateCode)){
            candidates.push({code:candidateCode,confidence:confidence(candidate.confidence),reason:candidate.reason.trim()});
          }
        }
        if(code&&!candidates.some(x=>x.code===code))candidates.unshift({code,confidence:selectedConfidence,reason});
        candidates=candidates.slice(0,3);
      }
    }

    let discontinuityVerificationUsed=false;
    let discontinuityVerificationResult:string|null=null;
    if(equipment==="GP"&&allowed.componentCode==="PAA"&&targetCropImage&&selectedCode&&
      PAA_DISCONTINUITY_TRIGGER_CODES.has(selectedCode)&&aiAllowedSet.has("CU")){
      discontinuityVerificationUsed=true;
      const verifyPrompt="Verify only whether the exact fine-reticle centre shows a real CUT through or sharply incised into the GP/PAA panel material.\n"+
        `The initial classifier selected ${selectedCode}, but rust, paint loss, gouging or deformation can visually mask a cut.\n`+
        "Return CU only when you can see a sharp linear opening/incision, severed sheet edge, or clear cut penetration at the reticle centre.\n"+
        "Do NOT call superficial scratches, rust lines, coating loss, stains, shadows, seams, gouges without penetration, or cracks CU.\n"+
        "If a true cut is not visually established, return NOT_CU. This is a conservative verification step, not a request to prefer CU.";
      const verifyRaw=await this.ai.run(MODEL,{
        messages:[{role:"user",content:[{type:"text",text:verifyPrompt},{type:"image_url",image_url:{url:targetCropImage}}]}],
        max_completion_tokens:300,reasoning_effort:"low",temperature:0,
        response_format:{type:"json_schema",json_schema:{name:"paa_cut_verification",strict:true,schema:{
          type:"object",properties:{result:{type:"string",enum:["CU","NOT_CU"]},confidence:{type:"number",minimum:0,maximum:1},reason:{type:"string"}},
          required:["result","confidence","reason"],additionalProperties:false
        }}}
      });
      const verifyEnvelope=record(verifyRaw);
      const verifyChoice=Array.isArray(verifyEnvelope?.choices)?record(verifyEnvelope.choices[0]):null;
      const verifyMessage=record(verifyChoice?.message);
      let verify:Record<string,unknown>|null=null;
      if(typeof verifyMessage?.content==="string"){try{verify=record(JSON.parse(verifyMessage.content));}catch{}}
      if(verify?.result==="CU"&&typeof verify.confidence==="number"&&verify.confidence>=0.8){
        discontinuityVerificationResult="CU";
        const previousCode=selectedCode;
        selectedCode="CU"; selectedConfidence=verify.confidence;
        needsReview=selectedConfidence<DAMAGE_REVIEW_THRESHOLD;
        reason=typeof verify.reason==="string"?verify.reason.trim():"Verified cut penetration at the target.";
        candidates=[{code:"CU",confidence:selectedConfidence,reason},...candidates.filter(x=>x.code!=="CU"&&x.code!==previousCode)].slice(0,3);
      }else discontinuityVerificationResult="NOT_CU";
    }
    const selectedRule=selectedDamageRule(visualRules,selectedCode);
    const result={
      componentCode:allowed.componentCode,
      analysisStatus,
      targetPointUsed:Boolean(targetPoint),
      targetCropUsed:Boolean(targetCropImage),
      morphologyPriorityUsed:equipment==="GP"&&allowed.componentCode==="PAA",
      selectedCode,
      confidence:selectedConfidence,
      needsReview,
      reason,
      candidates,
      allowedDamages:allowed.damages,
      model:MODEL,
      damageVisualKnowledgeUsed:visualRules.length>0,
      damageVisualRuleCount:visualRules.length,
      damageVisualRulesUsed:photoRules.length||visualRules.length,
      aiEligibleDamageCount:aiAllowedDamages.length,
      aiEligibleDamageCodes:aiAllowedCodes,
      excludedFromPhotoOnlyAi:allowedCodes.filter(code=>!aiAllowedSet.has(code)),
      discontinuityVerificationUsed,
      discontinuityVerificationResult,
      evidenceRequirement:selectedRule?.evidence_requirement??null,
      evidenceReviewRequired:selectedRule?.force_review===1,
      finishReason,
      completionTokenLimit:MAX_COMPLETION_TOKENS
    };

    await this.repo.saveDamagePrediction({
      findingId,
      surveyId:context.survey_id,
      modelName:MODEL,
      selectedCode,
      confidence:selectedConfidence,
      candidates,
      response:raw,
      status:analysisStatus==="INCOMPLETE"||analysisStatus==="INVALID_RESPONSE"?"FAILED":needsReview?"REVIEW_REQUIRED":"SUGGESTED",
      requestContext:{
        photoId:photo.id,
        targetPoint,
        targetCropPhotoId:targetCropPhoto?.id??null,
        targetCropUsed:Boolean(targetCropImage),
        targetCropReticle:targetCropImage?"FINE_LASER":null,
        morphologyPriorityUsed:equipment==="GP"&&allowed.componentCode==="PAA",
        damageReviewThreshold:DAMAGE_REVIEW_THRESHOLD,
        damageVisualKnowledgeUsed:visualRules.length>0,
        damageVisualRuleCount:visualRules.length,
        damageVisualRulesUsed:photoRules.length||visualRules.length,
        damageVisualRuleCodes:[...new Set(visualRules.map(rule=>rule.damage_code))],
        aiEligibleDamageCodes:aiAllowedCodes,
        excludedFromPhotoOnlyAi:allowedCodes.filter(code=>!aiAllowedSet.has(code)),
        discontinuityVerificationUsed,
        discontinuityVerificationResult,
        selectedEvidenceRequirement:selectedRule?.evidence_requirement??null,
        evidenceReviewRequired:selectedRule?.force_review===1,
        needsReview,
        selectedCode,
        selectedConfidence,
        aiEligibleDamageCount:aiAllowedCodes.length,
        photoOnlyAiSuggestion:true,
        max_completion_tokens:MAX_COMPLETION_TOKENS,
        reasoning_effort:"low",
        analysisStatus,
        finishReason
      }
    });

    return result;
  }
}
