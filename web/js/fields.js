// What a student profile contains, grouped the way it appears on screen.
// type: text | email | tel | date | number | select | combo (pick or type) | multi | textarea | status | counsellor
export const NATIONALITIES = ['Kuwaiti', 'Bidoon', 'Saudi', 'Emirati', 'Bahraini', 'Qatari', 'Omani', 'Egyptian', 'Jordanian', 'Palestinian',
  'Lebanese', 'Syrian', 'Iraqi', 'Yemeni', 'Sudanese', 'Iranian', 'Indian', 'Pakistani', 'Bangladeshi', 'Sri Lankan', 'Nepali',
  'Filipino', 'Afghan', 'Turkish', 'British', 'American', 'Canadian', 'Other'];
export const COUNTRIES = ['UK', 'USA', 'Canada', 'Australia', 'New Zealand', 'Ireland', 'Germany', 'Netherlands', 'Hungary',
  'Malaysia', 'Turkey', 'UAE', 'Other'];

export const OPTIONS = {
  gender: ['Male', 'Female'],
  curriculum: ['Kuwaiti (Ministry)', 'British (IGCSE / A-Level)', 'American (High School Diploma)', 'IB', 'Indian (CBSE / ICSE)', 'Pakistani', 'Egyptian (Thanaweya)', 'Other'],
  highest_education: ['High School (in progress)', 'High School', 'Foundation', 'Diploma', "Bachelor's", "Master's", 'PhD'],
  english_test: ['None yet', 'IELTS Academic', 'IELTS UKVI', 'TOEFL iBT', 'PTE Academic', 'Duolingo', 'Oxford Test of English', 'Other'],
  preferred_level: ['Foundation', 'Diploma', "Bachelor's", "Master's", 'PhD', 'Language course'],
  lead_source: ['Walk-in', 'Phone call', 'WhatsApp', 'Instagram', 'TikTok', 'Website', 'Google', 'School visit', 'Education fair', 'Referral by student', 'Referral by parent', 'Other'],
  guardian_relation: ['Father', 'Mother', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Spouse', 'Other'],
  contact_kind: ['call', 'whatsapp', 'email', 'visit', 'meeting', 'other'],
};
export const CONTACT_KIND_LABEL = { call: 'Phone call', whatsapp: 'WhatsApp', email: 'Email', visit: 'Office visit', meeting: 'Online meeting', other: 'Other' };
export const CONTACT_KIND_ICON = { call: 'phone', whatsapp: 'chat', email: 'mail', visit: 'users', meeting: 'globe', other: 'doc' };

export const GROUPS = [
  { title: 'Personal details', fields: [
    { key: 'full_name', label: 'Full name (as on passport)', type: 'text', required: true, wide: true },
    { key: 'gender', label: 'Gender', type: 'select', options: OPTIONS.gender },
    { key: 'dob', label: 'Date of birth', type: 'date', required: true },
    { key: 'nationality', label: 'Nationality', type: 'combo', options: NATIONALITIES },
    { key: 'status_id', label: 'Status', type: 'status' },
    { key: 'counsellor_id', label: 'Assigned counsellor', type: 'counsellor' },
    { key: 'lead_source', label: 'How they found AKI', type: 'combo', options: OPTIONS.lead_source },
  ] },
  { title: 'Identity documents', fields: [
    { key: 'civil_id', label: 'Civil ID number', type: 'text' },
    { key: 'civil_id_expiry', label: 'Civil ID expiry', type: 'date', expiry: true },
    { key: 'passport_no', label: 'Passport number', type: 'text' },
    { key: 'passport_expiry', label: 'Passport expiry', type: 'date', expiry: true },
  ] },
  { title: 'Contact', fields: [
    { key: 'phone', label: 'Phone', type: 'tel', required: true },
    { key: 'whatsapp', label: 'WhatsApp (if different)', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'address', label: 'Area / address', type: 'text' },
    { key: 'guardian_name', label: 'Parent / guardian name', type: 'text' },
    { key: 'guardian_relation', label: 'Relation', type: 'select', options: OPTIONS.guardian_relation },
    { key: 'guardian_phone', label: 'Parent / guardian phone', type: 'tel' },
    { key: 'guardian_email', label: 'Parent / guardian email', type: 'email' },
  ] },
  { title: 'Education', fields: [
    { key: 'high_school', label: 'High school', type: 'text', wide: true },
    { key: 'curriculum', label: 'Curriculum', type: 'combo', options: OPTIONS.curriculum },
    { key: 'grade', label: 'Grade / GPA', type: 'text' },
    { key: 'graduation_year', label: 'Graduation year', type: 'number' },
    { key: 'highest_education', label: 'Highest level of education', type: 'select', options: OPTIONS.highest_education },
    { key: 'english_test', label: 'English test', type: 'select', options: OPTIONS.english_test },
    { key: 'english_score', label: 'English score', type: 'text' },
    { key: 'english_test_date', label: 'Test date', type: 'date' },
  ] },
  { title: 'Study preferences', fields: [
    { key: 'preferred_countries', label: 'Preferred countries', type: 'multi', options: COUNTRIES, wide: true },
    { key: 'preferred_level', label: 'Study level', type: 'select', options: OPTIONS.preferred_level },
    { key: 'preferred_courses', label: 'Programme / course of interest', type: 'text' },
    { key: 'preferred_intake', label: 'Intake', type: 'text', placeholder: 'e.g. September 2027' },
    { key: 'budget', label: 'Budget', type: 'text', placeholder: 'e.g. up to £20,000 a year' },
  ] },
  { title: 'Notes', fields: [
    { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
  ] },
];

export const FIELD = Object.fromEntries(GROUPS.flatMap((g) => g.fields).map((f) => [f.key, f]));

// Every permission an employee can be given, in the order shown on the Users screen.
export const PERMISSIONS = [
  { group: 'Students', items: [
    ['students.view', 'View students'], ['students.create', 'Register new students'], ['students.edit', 'Edit students'],
    ['students.delete', 'Delete students'], ['students.export', 'Export student data'] ] },
  { group: 'Universities', items: [['universities.view', 'View universities'], ['universities.manage', 'Add / edit universities']] },
  { group: 'Documents', items: [['documents.view', 'View & download documents'], ['documents.upload', 'Upload documents'], ['documents.delete', 'Delete documents']] },
  { group: 'Visa', items: [['visa.view', 'View visa progress'], ['visa.edit', 'Update visa progress & guides']] },
  { group: 'Finance', items: [['finance.view', 'View finance'], ['finance.edit', 'Record payments & expenses'], ['finance.manage', 'Manage commission terms & reports']] },
  { group: 'Administration', items: [
    ['tasks.assign', 'Assign tasks to others'], ['users.manage', 'Manage employees & roles'], ['settings.manage', 'Change statuses & settings'],
    ['audit.view', 'View the full activity log'], ['backup.export', 'Download backups'] ] },
];
export const PERM_LABEL = Object.fromEntries(PERMISSIONS.flatMap((g) => g.items));
