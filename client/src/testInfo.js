// Plain-language meaning of common lab tests, so patients don't have to know "CBC" or "KFT".
// Matched on the lab's own test name (case-insensitive, first rule that matches wins).
// [pattern, Hindi (Roman), English, Hindi (Devanagari)]
const RULES = [
  [/hba1c|glycated/i, "3 mahine ki average sugar", "Average sugar of last 3 months", "3 महीने की औसत शुगर"],
  [/sugar|glucose|fasting|\bpp\b|\brbs\b/i, "Sugar (madhumeh / diabetes) ki jaanch", "Blood sugar (diabetes) test", "शुगर (मधुमेह) की जाँच"],
  [/\bcbc\b|complete blood/i, "Khoon ki poori jaanch", "Complete blood count", "खून की पूरी जाँच"],
  [/\bhb\b|haemoglobin|hemoglobin/i, "Khoon ki kami (Hb) ki jaanch", "Haemoglobin (anaemia) test", "खून की कमी (Hb) की जाँच"],
  [/\besr\b/i, "Sujan / infection ka pata", "Inflammation / infection marker", "सूजन / इन्फ़ेक्शन का पता"],
  [/blood group/i, "Aapka blood group", "Your blood group", "आपका ब्लड ग्रुप"],
  [/thyroid|\btsh\b|t3|t4/i, "Thyroid (gale ki granthi) ki jaanch", "Thyroid test", "थायरॉइड (गले की ग्रंथि) की जाँच"],
  [/lipid|cholesterol/i, "Cholesterol / dil ki jaanch", "Cholesterol / heart test", "कोलेस्ट्रॉल / दिल की जाँच"],
  [/\blft\b|liver/i, "Liver (jigar) ki jaanch", "Liver function test", "लिवर (जिगर) की जाँच"],
  [/\bkft\b|\brft\b|kidney|renal|electrolyte/i, "Kidney (gurde) ki jaanch", "Kidney function test", "किडनी (गुर्दे) की जाँच"],
  [/widal|typhoid/i, "Typhoid bukhar ki jaanch", "Typhoid fever test", "टाइफ़ाइड बुखार की जाँच"],
  [/malaria/i, "Malaria bukhar ki jaanch", "Malaria fever test", "मलेरिया बुखार की जाँच"],
  [/dengue/i, "Dengue bukhar ki jaanch", "Dengue fever test", "डेंगू बुखार की जाँच"],
  [/urine/i, "Peshab ki jaanch", "Urine test", "पेशाब की जाँच"],
  [/uric/i, "Jodon ke dard (uric acid) ki jaanch", "Uric acid (joint pain) test", "जोड़ों के दर्द (यूरिक एसिड) की जाँच"],
  [/vitamin\s*d/i, "Haddi ki kamzori / Vitamin D", "Vitamin D (bone health)", "हड्डी की कमज़ोरी / विटामिन D"],
  [/vitamin\s*b12|\bb12\b/i, "Kamzori / Vitamin B12", "Vitamin B12 (weakness)", "कमज़ोरी / विटामिन B12"],
  [/\bcrp\b/i, "Infection / sujan ki jaanch", "Infection / inflammation test", "इन्फ़ेक्शन / सूजन की जाँच"],
  [/hiv/i, "HIV ki jaanch", "HIV test", "HIV की जाँच"],
  [/hbsag|hepatitis/i, "Hepatitis (piliya) ki jaanch", "Hepatitis test", "हेपेटाइटिस (पीलिया) की जाँच"],
  [/pregnan|beta hcg|\bhcg\b/i, "Pregnancy ki jaanch", "Pregnancy test", "प्रेग्नेंसी की जाँच"],
  [/calcium/i, "Haddi ke liye calcium", "Calcium (bones)", "हड्डियों के लिए कैल्शियम"],
  [/iron|ferritin/i, "Khoon mein iron ki kami", "Iron levels", "खून में आयरन की कमी"],
];

export function testHint(name, lang = "hi") {
  const rule = RULES.find(([re]) => re.test(name || ""));
  if (!rule) return "";
  return lang === "en" ? rule[2] : lang === "hd" ? rule[3] : rule[1];
}
