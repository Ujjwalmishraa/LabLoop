// Server-side translations. The app sends Accept-Language: hi | en on every request (default hi).
// Error CODES never change; only the human message is translated.
//
// Lookup order for an error message (see translateError):
//   1. PHRASES: the exact message the code threw (they were written in Roman Hindi), so specific
//      messages like "Booking nahi mili" stay specific. Templates with {0}, {1} match messages that
//      carry numbers or names ("OTP galat hai. 3 koshish baaki.").
//   2. messages[lang][code]: a generic message for the code.
//   3. The original message.

export const LANGS = ["hi", "en"];
export const DEFAULT_LANG = "hi";

// ---------- by error code ----------
export const messages = {
  hi: {
    UNAUTHORIZED: "कृपया लॉगिन करें",
    FORBIDDEN: "आपको यह करने की अनुमति नहीं है",
    NOT_FOUND: "नहीं मिला",
    CONFLICT: "यह अभी नहीं हो सकता",
    BAD_REQUEST: "गलत रिक्वेस्ट",
    VALIDATION_ERROR: "भरी गई जानकारी सही नहीं है",
    BAD_JSON: "गलत रिक्वेस्ट",
    UPLOAD_ERROR: "फ़ाइल अपलोड नहीं हुई",
    FILE_TOO_LARGE: "फ़ाइल 5 MB से बड़ी है",
    DUPLICATE: "यह पहले से मौजूद है",
    DUPLICATE_EMAIL: "यह ईमेल पहले से रजिस्टर्ड है",
    DUPLICATE_PHONE: "यह मोबाइल नंबर पहले से रजिस्टर्ड है",
    SERVER_ERROR: "कुछ गलत हुआ, दोबारा कोशिश करें",
    ROUTE_NOT_FOUND: "यह रास्ता नहीं मिला",
    RATE_LIMITED: "बहुत ज़्यादा कोशिशें। थोड़ी देर बाद दोबारा करें।",
    LOGIN_RATE_LIMITED: "बहुत बार गलत पासवर्ड डाला गया। 15 मिनट बाद दोबारा कोशिश करें या 'पासवर्ड भूल गए' इस्तेमाल करें।",
    INVALID_CREDENTIALS: "मोबाइल/ईमेल या पासवर्ड गलत है",
    ACCOUNT_DISABLED: "आपका अकाउंट बंद है। LabLoop टीम से संपर्क करें।",
    TOKEN_EXPIRED: "सेशन खत्म हो गया, दोबारा लॉगिन करें",
    TOKEN_REVOKED: "सेशन खत्म हो गया, दोबारा लॉगिन करें",
    WRONG_OTP: "OTP गलत है",
    OTP_LOCKED: "बहुत बार गलत OTP। बुकिंग लॉक हो गई, LabLoop टीम से संपर्क करें।",
    MIN_ORDER: "कम से कम न्यूनतम राशि की जाँच बुक करें",
    OUT_OF_RANGE: "यह लैब आपके गाँव तक सैंपल लेने नहीं आता",
    TOKENS_FULL: "इस दिन के सारे नंबर भर गए। दूसरा दिन चुनें।",
    LINK_EXPIRED: "लिंक पुराना हो गया। रिपोर्ट दोबारा खोलें।",
    BAD_FILE_TYPE: "सिर्फ़ PDF, JPG या PNG फ़ाइल डालें",
    INVALID_TRANSITION: "बुकिंग अभी इस हालत में नहीं बदल सकती",
    NOT_DEPARTABLE: "कलेक्टर सिर्फ़ कन्फ़र्म बुकिंग के लिए निकल सकता है",
  },
  en: {
    UNAUTHORIZED: "Please log in",
    FORBIDDEN: "You are not allowed to do this",
    NOT_FOUND: "Not found",
    CONFLICT: "This can't be done right now",
    BAD_REQUEST: "Bad request",
    VALIDATION_ERROR: "Some details are not valid",
    BAD_JSON: "Bad request",
    UPLOAD_ERROR: "The file could not be uploaded",
    FILE_TOO_LARGE: "The file is larger than 5 MB",
    DUPLICATE: "This already exists",
    DUPLICATE_EMAIL: "This email is already registered",
    DUPLICATE_PHONE: "This mobile number is already registered",
    SERVER_ERROR: "Something went wrong, please try again",
    ROUTE_NOT_FOUND: "This route was not found",
    RATE_LIMITED: "Too many attempts. Please try again in a while.",
    LOGIN_RATE_LIMITED: "Too many wrong passwords. Try again in 15 minutes or use 'Forgot password'.",
    INVALID_CREDENTIALS: "Wrong mobile/email or password",
    ACCOUNT_DISABLED: "Your account is disabled. Please contact the LabLoop team.",
    TOKEN_EXPIRED: "Your session has ended, please log in again",
    TOKEN_REVOKED: "Your session has ended, please log in again",
    WRONG_OTP: "Wrong OTP",
    OTP_LOCKED: "Too many wrong OTPs. The booking is locked, please contact the LabLoop team.",
    MIN_ORDER: "Please book tests worth at least the minimum order value",
    OUT_OF_RANGE: "This lab does not collect samples in your village",
    TOKENS_FULL: "All tokens for this day are taken. Please pick another day.",
    LINK_EXPIRED: "This link has expired. Please open the report again.",
    BAD_FILE_TYPE: "Please upload a PDF, JPG or PNG file only",
    INVALID_TRANSITION: "The booking can't change to that status now",
    NOT_DEPARTABLE: "The collector can only leave for a confirmed booking",
  },
};

// ---------- zod field errors by issue type ----------
const FIELD = {
  hi: {
    required: "यह भरना ज़रूरी है",
    tooShort: "बहुत छोटा है",
    tooLong: "बहुत लंबा है",
    tooSmall: "बहुत कम है",
    tooBig: "बहुत ज़्यादा है",
    invalid: "सही नहीं है",
    phone: "10 अंकों का सही मोबाइल नंबर लिखें",
    date: "सही तारीख डालें",
    email: "सही ईमेल लिखें",
  },
  en: {
    required: "This is required",
    tooShort: "Too short",
    tooLong: "Too long",
    tooSmall: "Too small",
    tooBig: "Too large",
    invalid: "Not valid",
    phone: "Enter a valid 10-digit mobile number",
    date: "Enter a valid date",
    email: "Enter a valid email",
  },
};

// Field names shown before a validation message ("Address: …").
const FIELD_NAMES = {
  hi: { name: "नाम", phone: "मोबाइल", email: "ईमेल", password: "पासवर्ड", newPassword: "नया पासवर्ड", address: "पता", date: "तारीख", otp: "OTP", testIds: "टेस्ट", labId: "लैब", consent: "अनुमति", slot: "समय", collectionTime: "समय", age: "उम्र", gender: "लिंग", identifier: "मोबाइल/ईमेल" },
  en: { name: "Name", phone: "Mobile", email: "Email", password: "Password", newPassword: "New password", address: "Address", date: "Date", otp: "OTP", testIds: "Tests", labId: "Lab", consent: "Consent", slot: "Time", collectionTime: "Time", age: "Age", gender: "Gender", identifier: "Mobile/email" },
};

// ---------- by original message: [hi, en] ----------
// {0}, {1}… are filled from the numbers/words in the original message.
const PHRASE_LIST = [
  // auth / session
  ["Kripya login karein", "कृपया लॉगिन करें", "Please log in"],
  ["Aapko yeh karne ki anumati nahi hai", "आपको यह करने की अनुमति नहीं है", "You are not allowed to do this"],
  ["Nahi mila", "नहीं मिला", "Not found"],
  ["Session khatam ho gaya, dobara login karein", "सेशन खत्म हो गया, दोबारा लॉगिन करें", "Your session has ended, please log in again"],
  ["Pehle naya password banayein", "पहले नया पासवर्ड बनाएँ", "Please set a new password first"],
  ["Galat ID", "गलत ID", "Invalid ID"],
  ["Password kam se kam 8 akshar ka ho", "पासवर्ड कम से कम 8 अक्षर का हो", "Password must be at least 8 characters"],
  ["Password bahut lamba hai", "पासवर्ड बहुत लंबा है", "Password is too long"],
  ["Password mein kam se kam ek akshar aur ek ank ho", "पासवर्ड में कम से कम एक अक्षर और एक अंक हो", "Password must have at least one letter and one number"],
  ["10 ankon ka sahi mobile number likhein", "10 अंकों का सही मोबाइल नंबर लिखें", "Enter a valid 10-digit mobile number"],
  ["Sahi email likhein", "सही ईमेल लिखें", "Enter a valid email"],
  ["Naam likhein", "नाम लिखें", "Enter a name"],
  ["Yeh mobile number pehle se registered hai. Login karein.", "यह मोबाइल नंबर पहले से रजिस्टर्ड है। लॉगिन करें।", "This mobile number is already registered. Please log in."],
  ["Yeh mobile number pehle se registered hai", "यह मोबाइल नंबर पहले से रजिस्टर्ड है", "This mobile number is already registered"],
  ["Yeh email pehle se registered hai", "यह ईमेल पहले से रजिस्टर्ड है", "This email is already registered"],
  ["Yeh pehle se maujood hai", "यह पहले से मौजूद है", "This already exists"],
  ["Mobile/email ya password galat hai", "मोबाइल/ईमेल या पासवर्ड गलत है", "Wrong mobile/email or password"],
  ["Aapka account band hai. LabLoop team se sampark karein.", "आपका अकाउंट बंद है। LabLoop टीम से संपर्क करें।", "Your account is disabled. Please contact the LabLoop team."],
  ["Purana password galat hai", "पुराना पासवर्ड गलत है", "The current password is wrong"],
  ["Naya password purane se alag hona chahiye", "नया पासवर्ड पुराने से अलग होना चाहिए", "The new password must be different from the old one"],
  ["Link purana ya galat hai. Dobara 'Password bhool gaye' karein.", "लिंक पुराना या गलत है। दोबारा 'पासवर्ड भूल गए' करें।", "This link is old or invalid. Please use 'Forgot password' again."],
  ["Bahut baar galat password daala gaya. 15 minute baad dobara koshish karein ya 'Password bhool gaye' use karein.", "बहुत बार गलत पासवर्ड डाला गया। 15 मिनट बाद दोबारा कोशिश करें या 'पासवर्ड भूल गए' इस्तेमाल करें।", "Too many wrong passwords. Try again in 15 minutes or use 'Forgot password'."],
  ["Bahut zyada koshish ho gayi. Thodi der baad dobara karein.", "बहुत ज़्यादा कोशिशें हो गईं। थोड़ी देर बाद दोबारा करें।", "Too many attempts. Please try again in a while."],
  ["Agar yeh email registered hai, toh password badalne ka link bhej diya gaya hai.", "अगर यह ईमेल रजिस्टर्ड है, तो पासवर्ड बदलने का लिंक भेज दिया गया है।", "If this email is registered, a password reset link has been sent."],
  ["Password badal gaya. Ab login karein.", "पासवर्ड बदल गया। अब लॉगिन करें।", "Password changed. Please log in."],
  // generic
  ["Galat request", "गलत रिक्वेस्ट", "Bad request"],
  ["Yeh raasta nahi mila", "यह रास्ता नहीं मिला", "This route was not found"],
  ["Kuch galat hua, dobara koshish karein", "कुछ गलत हुआ, दोबारा कोशिश करें", "Something went wrong, please try again"],
  ["File 5 MB se badi hai", "फ़ाइल 5 MB से बड़ी है", "The file is larger than 5 MB"],
  ["File upload nahi hui", "फ़ाइल अपलोड नहीं हुई", "The file could not be uploaded"],
  ["Kuch badlav bhejein", "कुछ बदलाव भेजें", "Send at least one change"],
  // admin / agent
  ["Yahan sirf agent bana sakte hain", "यहाँ सिर्फ़ एजेंट बना सकते हैं", "Only agents can be created here"],
  ["Apna khud ka account band nahi kar sakte", "अपना खुद का अकाउंट बंद नहीं कर सकते", "You can't disable your own account"],
  ["User nahi mila", "यूज़र नहीं मिला", "User not found"],
  ["Lab nahi mila", "लैब नहीं मिला", "Lab not found"],
  ['Is lab ki {0} booking hain. Mareezon ka record bachane ke liye delete nahi hoga, "Band karein" use karein.', 'इस लैब की {0} बुकिंग हैं। मरीज़ों का रिकॉर्ड बचाने के लिए डिलीट नहीं होगा, "बंद करें" इस्तेमाल करें।', 'This lab has {0} bookings. To keep patient records it can\'t be deleted; use "Disable" instead.'],
  ["Doctor nahi mile", "डॉक्टर नहीं मिले", "Doctor not found"],
  ['Is doctor ke {0} appointment/referral hain. Record bachane ke liye delete nahi hoga, "Band karein" use karein.', 'इस डॉक्टर के {0} अपॉइंटमेंट/रेफ़रल हैं। रिकॉर्ड बचाने के लिए डिलीट नहीं होगा, "बंद करें" इस्तेमाल करें।', 'This doctor has {0} appointments/referrals. To keep records it can\'t be deleted; use "Disable" instead.'],
  ["Settlement nahi mila", "सेटलमेंट नहीं मिला", "Settlement not found"],
  ["Sahi date daalein", "सही तारीख डालें", "Enter a valid date"],
  ["Hafta abhi khatam nahi hua", "हफ़्ता अभी खत्म नहीं हुआ", "The week has not ended yet"],
  ["Payment reference (UTR) daalein", "पेमेंट रेफ़रेंस (UTR) डालें", "Enter the payment reference (UTR)"],
  ["Pehle se paid hai", "पहले से पेड है", "Already paid"],
  ["Koi chuna hua gaon nahi mila", "कोई चुना हुआ गाँव नहीं मिला", "None of the selected villages were found"],
  ["Lab/doctor ko band ya delete sirf admin kar sakta hai", "लैब/डॉक्टर को बंद या डिलीट सिर्फ़ एडमिन कर सकता है", "Only an admin can disable or delete a lab/doctor"],
  ["Koi sahi test nahi mila. Har line 'Naam = Rate' likhein.", "कोई सही टेस्ट नहीं मिला। हर लाइन 'नाम = रेट' लिखें।", "No valid tests found. Write each line as 'Name = Rate'."],
  ["Patient rate B2B rate se kam hai", "पेशेंट रेट B2B रेट से कम है", "Patient rate is below the B2B rate"],
  ["Format 'Naam = Rate' hona chahiye", "फ़ॉर्मैट 'नाम = रेट' होना चाहिए", "The format should be 'Name = Rate'"],
  ["Naam ya rate sahi nahi", "नाम या रेट सही नहीं", "Name or rate is not valid"],
  ["Sahi date (YYYY-MM-DD) daalein", "सही तारीख (YYYY-MM-DD) डालें", "Enter a valid date (YYYY-MM-DD)"],
  ["'Se' date 'Tak' date se pehle honi chahiye", "'से' तारीख 'तक' तारीख से पहले होनी चाहिए", "The 'From' date must be before the 'To' date"],
  // doctor
  ["Doctor profile nahi mila", "डॉक्टर प्रोफ़ाइल नहीं मिला", "Doctor profile not found"],
  ["Appointment nahi mila", "अपॉइंटमेंट नहीं मिला", "Appointment not found"],
  ["Yeh appointment ab badal nahi sakta", "यह अपॉइंटमेंट अब बदल नहीं सकता", "This appointment can no longer be changed"],
  ["Aane wale din ka appointment abhi mark nahi kar sakte", "आने वाले दिन का अपॉइंटमेंट अभी मार्क नहीं कर सकते", "You can't mark a future appointment yet"],
  ["Receipt ka 4 ank ka code daalein", "रसीद का 4 अंक का कोड डालें", "Enter the 4-digit code from the receipt"],
  ["Kam se kam ek test chunein", "कम से कम एक टेस्ट चुनें", "Choose at least one test"],
  ["Cancel hue appointment pe test nahi likh sakte", "कैंसिल हुए अपॉइंटमेंट पर टेस्ट नहीं लिख सकते", "You can't order tests on a cancelled appointment"],
  ["Is appointment pe test pehle se likha ja chuka hai", "इस अपॉइंटमेंट पर टेस्ट पहले से लिखा जा चुका है", "Tests were already ordered for this appointment"],
  ["Mareez nahi mila", "मरीज़ नहीं मिला", "Patient not found"],
  ["Mareez ka gaon pata nahi hai", "मरीज़ का गाँव पता नहीं है", "The patient's village is not known"],
  ["Samay HH:MM mein likhein", "समय HH:MM में लिखें", "Write the time as HH:MM"],
  ["Shuru ka samay khatam se pehle ho", "शुरू का समय खत्म से पहले हो", "Start time must be before end time"],
  ["Ek din ek hi baar likhein", "एक दिन एक ही बार लिखें", "List each day only once"],
  ["Walk-in mareez ka naam likhein", "वॉक-इन मरीज़ का नाम लिखें", "Enter the walk-in patient's name"],
  ["Appointment ya walk-in mareez mein se ek chunein", "अपॉइंटमेंट या वॉक-इन मरीज़ में से एक चुनें", "Choose either an appointment or a walk-in patient"],
  ["Clinic ki location pata nahi hai", "क्लिनिक की लोकेशन पता नहीं है", "The clinic location is not known"],
  ["Yeh lab aapke clinic tak sample lene nahi aata", "यह लैब आपके क्लिनिक तक सैंपल लेने नहीं आता", "This lab does not collect samples at your clinic"],
  ["Ghar se sample ke liye mareez ka account chahiye", "घर से सैंपल के लिए मरीज़ का अकाउंट चाहिए", "Home collection needs a patient with an account"],
  ["Request nahi mili", "रिक्वेस्ट नहीं मिली", "Request not found"],
  // files / reports
  ["Link purana ho gaya. Report dobara kholein.", "लिंक पुराना हो गया। रिपोर्ट दोबारा खोलें।", "This link has expired. Please open the report again."],
  ["Report nahi mili", "रिपोर्ट नहीं मिली", "Report not found"],
  // lab
  ["Booking nahi mili", "बुकिंग नहीं मिली", "Booking not found"],
  ["Collector ka samay chunein", "कलेक्टर का समय चुनें", "Choose the collector's time"],
  ["4 ank ka OTP daalein", "4 अंक का OTP डालें", "Enter the 4-digit OTP"],
  ["Pehle booking confirm karein", "पहले बुकिंग कन्फ़र्म करें", "Confirm the booking first"],
  ["Sirf PDF, JPG ya PNG file daalein", "सिर्फ़ PDF, JPG या PNG फ़ाइल डालें", "Please upload a PDF, JPG or PNG file only"],
  ["Report sirf sample lene ke baad daal sakte hain", "रिपोर्ट सिर्फ़ सैंपल लेने के बाद डाल सकते हैं", "A report can only be uploaded after the sample is collected"],
  ["Report file chunein", "रिपोर्ट फ़ाइल चुनें", "Choose the report file"],
  ["File kharab hai ya PDF/JPG/PNG nahi hai", "फ़ाइल खराब है या PDF/JPG/PNG नहीं है", "The file is damaged or not a PDF/JPG/PNG"],
  ["Test nahi mila", "टेस्ट नहीं मिला", "Test not found"],
  ["Patient rate ₹{0} (B2B) se kam nahi ho sakta", "पेशेंट रेट ₹{0} (B2B) से कम नहीं हो सकता", "Patient rate can't be below ₹{0} (B2B)"],
  ["Sirf confirm booking ke liye nikal sakte hain", "सिर्फ़ कन्फ़र्म बुकिंग के लिए निकल सकते हैं", "You can only leave for a confirmed booking"],
  ["Raasta nahi mila", "रास्ता नहीं मिला", "Could not find the route"],
  ["Collector pehle hi nikal chuka hai", "कलेक्टर पहले ही निकल चुका है", "The collector has already left"],
  // patient
  ["Gaon nahi mila", "गाँव नहीं मिला", "Village not found"],
  ["Zyada se zyada 20 sadasya jod sakte hain", "ज़्यादा से ज़्यादा 20 सदस्य जोड़ सकते हैं", "You can add at most 20 family members"],
  ["Sadasya nahi mila", "सदस्य नहीं मिला", "Family member not found"],
  ["Ghar ka pata likhein", "घर का पता लिखें", "Enter your home address"],
  ["Report dekhne ki anumati par tick karein", "रिपोर्ट देखने की अनुमति पर टिक करें", "Please tick the consent to share the report"],
  ["Pehle apna gaon chunein", "पहले अपना गाँव चुनें", "Choose your village first"],
  ["Sample lene ke baad booking cancel nahi ho sakti", "सैंपल लेने के बाद बुकिंग कैंसिल नहीं हो सकती", "A booking can't be cancelled after the sample is collected"],
  ["Number nahi mila", "नंबर नहीं मिला", "Token not found"],
  ["Yeh number ab cancel nahi ho sakta", "यह नंबर अब कैंसिल नहीं हो सकता", "This token can no longer be cancelled"],
  ["Purana number cancel nahi ho sakta", "पुराना नंबर कैंसिल नहीं हो सकता", "A past token can't be cancelled"],
  // appointments
  ["Sahi din chunein", "सही दिन चुनें", "Choose a valid day"],
  ["Aaj ya aage ke 30 din mein se din chunein", "आज या आगे के 30 दिन में से दिन चुनें", "Choose today or a day within the next 30 days"],
  ["Doctor us din nahi baithte. Doosra din chunein.", "डॉक्टर उस दिन नहीं बैठते। दूसरा दिन चुनें।", "The doctor doesn't sit on that day. Please pick another day."],
  ["Parivaar ka sadasya nahi mila", "परिवार का सदस्य नहीं मिला", "Family member not found"],
  ["Is din is doctor ka number pehle se laga hai", "इस दिन इस डॉक्टर का नंबर पहले से लगा है", "You already have a token with this doctor on this day"],
  ["Is din ke saare number bhar gaye. Doosra din chunein.", "इस दिन के सारे नंबर भर गए। दूसरा दिन चुनें।", "All tokens for this day are taken. Please pick another day."],
  ["Abhi bahut log number le rahe hain, dobara koshish karein", "अभी बहुत लोग नंबर ले रहे हैं, दोबारा कोशिश करें", "Many people are booking right now, please try again"],
  ["Bahut baar galat code. Yeh number lock ho gaya, LabLoop team se sampark karein.", "बहुत बार गलत कोड। यह नंबर लॉक हो गया, LabLoop टीम से संपर्क करें।", "Too many wrong codes. This token is locked, please contact the LabLoop team."],
  ["Receipt ka code galat hai. {0} koshish baaki.", "रसीद का कोड गलत है। {0} कोशिश बाकी।", "Wrong receipt code. {0} tries left."],
  // bookings
  ['Booking abhi "{0}" hai, "{1}" nahi ho sakti', 'बुकिंग अभी "{0}" है, "{1}" नहीं हो सकती', 'The booking is "{0}" now and can\'t become "{1}"'],
  ["Aaj se 7 din ke andar ka din chunein", "आज से 7 दिन के अंदर का दिन चुनें", "Choose a day within the next 7 days"],
  ["Yeh lab aapke gaon tak sample lene nahi aata", "यह लैब आपके गाँव तक सैंपल लेने नहीं आता", "This lab does not collect samples in your village"],
  ["Kuch test is lab mein uplabdh nahi hain", "कुछ टेस्ट इस लैब में उपलब्ध नहीं हैं", "Some tests are not available at this lab"],
  ["Kam se kam ₹{0} ki jaanch book karein", "कम से कम ₹{0} की जाँच बुक करें", "Please book tests worth at least ₹{0}"],
  ["Bahut baar galat OTP. Booking lock ho gayi, LabLoop team se sampark karein.", "बहुत बार गलत OTP। बुकिंग लॉक हो गई, LabLoop टीम से संपर्क करें।", "Too many wrong OTPs. The booking is locked, please contact the LabLoop team."],
  ["OTP galat hai. {0} koshish baaki.", "OTP गलत है। {0} कोशिश बाकी।", "Wrong OTP. {0} tries left."],
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EXACT = new Map();
const TEMPLATES = [];
for (const [src, hi, en] of PHRASE_LIST) {
  const entry = { hi, en };
  if (/\{\d\}/.test(src)) {
    const re = new RegExp("^" + escapeRe(src).replace(/\\\{(\d)\\\}/g, "(.+?)") + "$");
    TEMPLATES.push({ re, entry });
  } else EXACT.set(src, entry);
  // Already-translated text (e.g. thrown in English) maps to itself too.
  EXACT.set(en, entry);
}

const fill = (s, args) => s.replace(/\{(\d)\}/g, (_m, i) => args[Number(i)] ?? "");

// Translate one message written in Roman Hindi (or English). Returns null if unknown.
export function translateText(lang, text) {
  if (!text || !LANGS.includes(lang)) return null;
  const hit = EXACT.get(text);
  if (hit) return hit[lang];
  for (const { re, entry } of TEMPLATES) {
    const m = re.exec(text);
    if (m) return fill(entry[lang], m.slice(1));
  }
  return null;
}

export function translateError(lang, code, message) {
  return translateText(lang, message) ?? messages[lang]?.[code] ?? message;
}

// zod issue -> translated message (custom messages first, then by issue type).
export function translateIssue(lang, issue) {
  const known = translateText(lang, issue.message);
  if (known) return known;
  const f = FIELD[lang] || FIELD.hi;
  const field = String(issue.path?.[issue.path.length - 1] ?? "");
  if (issue.code === "invalid_type" && /received undefined/.test(issue.message)) return f.required;
  if (field === "phone") return f.phone;
  if (field === "date" || field === "from" || field === "to") return f.date;
  if (field === "email" || issue.format === "email") return f.email;
  if (issue.code === "too_small") return issue.origin === "string" || issue.origin === "array" ? (issue.minimum === 1 ? f.required : f.tooShort) : f.tooSmall;
  if (issue.code === "too_big") return issue.origin === "string" || issue.origin === "array" ? f.tooLong : f.tooBig;
  return f.invalid;
}

export const fieldName = (lang, field) => FIELD_NAMES[lang]?.[field] || field;

// Accept-Language: "en", "en-IN,en;q=0.9", "hi" … -> "hi" | "en". Default hi.
export function pickLang(header) {
  const first = String(header || "")
    .split(",")
    .map((p) => p.trim().toLowerCase().split(";")[0])
    .find((tag) => LANGS.includes(tag.slice(0, 2)));
  return first ? first.slice(0, 2) : DEFAULT_LANG;
}

export function langMiddleware(req, _res, next) {
  req.lang = pickLang(req.get("accept-language"));
  next();
}
