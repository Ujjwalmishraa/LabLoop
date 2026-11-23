// Development seed data. All lab, doctor and patient names are fictional.
// "Shree Pathology Lab" uses a real Siwan rate list (walk-in prices).

export const villages = [
  { name: "Maharajganj Bazaar", lat: 26.112, lng: 84.5 },
  { name: "Rampur", lat: 26.12, lng: 84.495 },
  { name: "Sonbarsa", lat: 26.135, lng: 84.512 },
  { name: "Bhagwanpur", lat: 26.098, lng: 84.52 },
  { name: "Chainpur", lat: 26.15, lng: 84.47 },
  { name: "Mohammadpur", lat: 26.09, lng: 84.48 },
  { name: "Sarsar", lat: 26.17, lng: 84.54 },
].map((v) => ({ ...v, block: "Maharajganj", district: "Siwan" }));

export const shreeTests = `CBC = 400
Sugar Fasting = 50
Sugar PP = 50
HbA1c = 550
Thyroid (T3, T4, TSH) = 600
TSH = 200
Lipid Profile = 650
LFT = 800
KFT + Electrolyte = 900
KFT = 600
Urine Routine = 100
Uric Acid = 150
Hb = 100
Widal = 120
Malaria = 100
Malaria (card test) = 500
Dengue NS1 = 1200
Vitamin D = 800
ESR = 150
Blood Group = 50`;

export const jeevanTests = `CBC = 350
Sugar Fasting = 60
Sugar PP = 60
HbA1c = 500
Thyroid (T3, T4, TSH) = 550
Lipid Profile = 600
LFT = 700
KFT = 650
Urine Routine = 120
Widal = 150
Malaria = 120
Blood Group = 60`;

export const FASTING = new Set(["Sugar Fasting", "Lipid Profile"]);

export const labs = [
  {
    key: "shree",
    name: "Shree Pathology Lab (Demo)",
    address: "Main Bazaar, Maharajganj",
    phone: "9000000001",
    block: "Maharajganj",
    lat: 26.112,
    lng: 84.5,
    serviceRadiusKm: 6,
    // Villages this lab serves. Patients elsewhere never see it.
    villages: ["Maharajganj Bazaar", "Rampur", "Bhagwanpur", "Mohammadpur"],
    pathologist: { name: "Dr. Demo Pathologist", qualification: "MD Pathology", registrationNo: "BMC-00001" },
    licenceNo: "LAB-DEMO-1",
    tests: shreeTests,
    staff: { name: "Shree Lab Staff", email: "lab.shree@nidaansetu.test" },
  },
  {
    key: "jeevan",
    name: "Jeevan Diagnostic Centre (Demo)",
    address: "Station Road, Maharajganj",
    phone: "9000000002",
    block: "Maharajganj",
    lat: 26.14,
    lng: 84.49,
    serviceRadiusKm: 5,
    villages: ["Rampur", "Chainpur", "Sonbarsa"],
    pathologist: { name: "Dr. Demo Two", qualification: "MD Pathology", registrationNo: "BMC-00002" },
    licenceNo: "LAB-DEMO-2",
    tests: jeevanTests,
    staff: { name: "Jeevan Lab Staff", email: "lab.jeevan@nidaansetu.test" },
  },
];

const wk = (days, start, end, maxTokens) => days.map((day) => ({ day, start, end, maxTokens }));

// One doctor per village. `village` tags the doctor to it: patients of that village see this doctor.
export const doctors = [
  {
    name: "Dr. Anil Kumar",
    email: "dr.kumar@nidaansetu.test",
    village: "Maharajganj Bazaar",
    degree: "MBBS",
    registrationNo: "BMC-11111",
    specialty: "General Physician",
    specialtyHi: "सामान्य रोग चिकित्सक",
    clinicName: "Kumar Clinic",
    clinicAddress: "Main Bazaar, Maharajganj",
    lat: 26.113,
    lng: 84.501,
    fee: 300,
    schedule: wk(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], "10:00", "14:00", 30),
  },
  {
    name: "Dr. Sunita Devi",
    email: "dr.devi@nidaansetu.test",
    village: "Rampur",
    degree: "MBBS, DGO",
    registrationNo: "BMC-22222",
    specialty: "Gynaecologist",
    specialtyHi: "महिला रोग विशेषज्ञ",
    clinicName: "Devi Mahila Clinic",
    clinicAddress: "Rampur Chowk",
    lat: 26.121,
    lng: 84.496,
    fee: 400,
    schedule: wk(["Mon", "Wed", "Fri"], "11:00", "15:00", 20),
  },
  {
    name: "Dr. Rakesh Singh",
    email: "dr.singh@nidaansetu.test",
    village: "Sonbarsa",
    degree: "MBBS, MD (Paediatrics)",
    registrationNo: "BMC-33333",
    specialty: "Paediatrician",
    specialtyHi: "बच्चों के डॉक्टर",
    clinicName: "Singh Child Care",
    clinicAddress: "Sonbarsa Bazaar",
    lat: 26.136,
    lng: 84.513,
    fee: 350,
    schedule: wk(["Tue", "Thu", "Sat"], "09:00", "13:00", 25),
  },
  {
    name: "Dr. Manoj Tiwari",
    email: "dr.tiwari@nidaansetu.test",
    village: "Bhagwanpur",
    degree: "MBBS",
    registrationNo: "BMC-44444",
    specialty: "General Physician",
    specialtyHi: "सामान्य रोग चिकित्सक",
    clinicName: "Tiwari Clinic",
    clinicAddress: "Bhagwanpur Chowk",
    lat: 26.099,
    lng: 84.521,
    fee: 250,
    schedule: wk(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], "09:00", "13:00", 30),
  },
  {
    name: "Dr. Pooja Mishra",
    email: "dr.mishra@nidaansetu.test",
    village: "Chainpur",
    degree: "MBBS, DDVL",
    registrationNo: "BMC-55555",
    specialty: "Dermatologist",
    specialtyHi: "चर्म रोग विशेषज्ञ",
    clinicName: "Mishra Skin Clinic",
    clinicAddress: "Chainpur Main Road",
    lat: 26.151,
    lng: 84.471,
    fee: 400,
    schedule: wk(["Mon", "Wed", "Sat"], "10:00", "14:00", 20),
  },
  {
    name: "Dr. Imran Ansari",
    email: "dr.ansari@nidaansetu.test",
    village: "Mohammadpur",
    degree: "MBBS",
    registrationNo: "BMC-66666",
    specialty: "General Physician",
    specialtyHi: "सामान्य रोग चिकित्सक",
    clinicName: "Ansari Clinic",
    clinicAddress: "Mohammadpur Bazaar",
    lat: 26.091,
    lng: 84.481,
    fee: 250,
    schedule: wk(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], "16:00", "20:00", 30),
  },
  {
    name: "Dr. Kavita Yadav",
    email: "dr.yadav@nidaansetu.test",
    village: "Sarsar",
    degree: "MBBS, DGO",
    registrationNo: "BMC-77777",
    specialty: "Gynaecologist",
    specialtyHi: "महिला रोग विशेषज्ञ",
    clinicName: "Yadav Mahila Clinic",
    clinicAddress: "Sarsar Chowk",
    lat: 26.171,
    lng: 84.541,
    fee: 350,
    schedule: wk(["Tue", "Thu", "Sat"], "10:00", "14:00", 20),
  },
];

export const agent = { name: "Field Agent (Demo)", email: "agent@nidaansetu.test" };

export const patients = [
  { name: "Ram Prasad", phone: "9876500001", village: "Rampur" },
  { name: "Sita Devi", phone: "9876500002", village: "Sonbarsa" },
];

// One shared dev password for every seeded account. Never used outside seed:dev / e2e.
export const DEV_PASSWORD = "Nidaan@2026";
