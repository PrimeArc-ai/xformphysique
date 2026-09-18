from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

WAIVER_VERSION = "xform-foundation-waiver-v1"
WAIVER_TEXT = """IMPORTANT — PLEASE READ THIS WAIVER CAREFULLY BEFORE SUBMITTING YOUR APPLICATION:

BY JOINING THE XFORMPHYSIQUE PROGRAM, YOU ACKNOWLEDGE AND ACCEPT THE INHERENT RISKS ASSOCIATED WITH PHYSICAL TRAINING, BODY TRANSFORMATIONS, CONTEST PREPARATION, OR ANY FITNESS-RELATED ACTIVITY. YOU FULLY UNDERSTAND THAT PARTICIPATION MAY INVOLVE THE RISK OF INJURY, PHYSICAL STRAIN, OR OTHER HEALTH ISSUES, AND YOU AGREE TO TAKE FULL RESPONSIBILITY FOR YOUR OWN HEALTH AND SAFETY.

YOU HEREBY RELEASE, WAIVE, AND DISCHARGE XFORMPHYSIQUE AND ALL ITS COACHES, TEAM MEMBERS, ASSOCIATES, AND REPRESENTATIVES FROM ANY LIABILITY — NOW OR IN THE FUTURE — FOR ANY PHYSICAL OR MEDICAL COMPLICATIONS THAT MAY ARISE DURING OR AFTER YOUR PARTICIPATION IN OUR PROGRAMS.

YOU CONFIRM THAT YOU ARE ENROLLING WILLINGLY, WITHOUT FORCE OR PRESSURE, AND HAVE HAD THE OPPORTUNITY TO ASK QUESTIONS REGARDING YOUR HEALTH, THE PROGRAM STRUCTURE, AND ALL RELATED SERVICES.

FURTHERMORE, YOU AGREE THAT ALL PAYMENTS MADE TOWARD COACHING, CONSULTATION, OR ANY SERVICE BY XFORMPHYSIQUE ARE FINAL AND NON-REFUNDABLE, REGARDLESS OF CIRCUMSTANCE.

BY SUBMITTING THIS FORM, YOU DECLARE THAT ALL INFORMATION SHARED BY YOU IS HONEST, ACCURATE, AND COMPLETE TO THE BEST OF YOUR KNOWLEDGE. YOU FULLY UNDERSTAND AND AGREE TO ALL TERMS LISTED ABOVE.

DO YOU AGREE TO THE TERMS OF THIS WAIVER AND FULLY ACCEPT RESPONSIBILITY FOR YOUR PARTICIPATION?"""


def _strip_parentheticals(label: str) -> str:
    value = re.sub(r"\([^)]*\)", "", label)
    value = value.replace('"', "").replace("'", "'")
    value = value.replace("–", "-").replace("—", "-")
    value = re.sub(r"\s+", " ", value)
    return value.strip(" *-")


def _normalize_key(label: str) -> str:
    return _strip_parentheticals(label).casefold()


def _option_id(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", _strip_parentheticals(label).casefold()).strip("_")
    slug = re.sub(r"_+", "_", slug)
    return slug[:80].rstrip("_")


def _build_options(*sections: list[str]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = [{"id": "none", "label": "None"}]
    seen_labels = {"none"}
    used_ids = {"none"}
    for section in sections:
        for raw_label in section:
            label = _strip_parentheticals(raw_label)
            normalized = label.casefold()
            if not label or normalized == "none" or normalized in seen_labels:
                continue
            candidate = _option_id(label)
            unique = candidate
            suffix = 2
            while unique in used_ids:
                suffix_text = f"_{suffix}"
                unique = f"{candidate[: max(1, 80 - len(suffix_text))].rstrip('_')}{suffix_text}"
                suffix += 1
            items.append({"id": unique, "label": label})
            seen_labels.add(normalized)
            used_ids.add(unique)
    return items


def _simple_options(*labels: str) -> list[dict[str, str]]:
    return [{"id": _option_id(label), "label": _strip_parentheticals(label)} for label in labels]


SECTION_114_SLEEP_RECOVERY = [
    "Do you snore or have you ever been diagnosed with sleep apnea?",
    "Do you use sleep aids?",
    "Do you nap during the day?",
]
SECTION_114_GUT_DIGESTIVE = [
    "Do you experience bloating without eating or at random times?",
    "Have you ever done a food intolerance or gut microbiome test?",
    "Do you take probiotics or fermented foods regularly?",
]
SECTION_114_THYROID_AUTOIMMUNE = [
    "Have you been diagnosed with Hashimoto's, Graves' disease, or any autoimmune disorder?",
]
SECTION_114_MENTAL_COGNITIVE = [
    "Do you feel foggy-headed or forgetful during the day?",
    "Have you been diagnosed with depression, ADHD, OCD, or any neurological condition?",
]
SECTION_114_ALLERGY_ENVIRONMENTAL = [
    "Are you sensitive to strong smells, perfumes, cleaning products, or smoke?",
    "Do you have seasonal allergies?",
]
SECTION_114_SKIN_HAIR = [
    "Do you have any chronic skin issues like psoriasis, eczema, rosacea?",
    "Are you losing hair rapidly or noticing significant hair thinning?",
]
SECTION_114_PAIN_INFLAMMATION = [
    "Do you experience stiffness in the morning that lasts more than 15 minutes?",
    "Do you feel puffy or inflamed in your hands, face, or legs?",
]
SECTION_114_RECOVERY_BIOMARKERS = [
    "Have you ever measured CRP, ESR, or homocysteine?",
    "Would you be open to advanced lab work for optimization?",
]
SECTION_114_BLOOD_SUGAR = [
    "Have you ever measured your fasting insulin or HbA1c?",
    "Do you feel shaky, irritable, or anxious when you skip meals?",
]
SECTION_114_BREATHING = [
    "Do you often breathe from your chest or mouth instead of nose?",
    "Do you feel short of breath even at rest or while lying down?",
]

SECTION_115_METABOLIC_SIGNALS = [
    "Darkened, velvety skin patches on neck, armpits, or groin",
    "Multiple small skin tags around neck, shoulders, or underarms",
    "Severe energy crash or extreme sleepiness 30-90 minutes after carb-heavy meals",
    "Uncontrollable sugar cravings immediately after finishing a meal",
    "Feeling shaky, lightheaded, anxious, or irritable if a meal is delayed by 1-2 hours",
    "Waking up in the middle of the night feeling wide awake or with a racing heart",
    "Difficulty losing abdominal fat despite being in a calorie deficit",
]
SECTION_116_ENDOCRINE_SIGNALS = [
    "Diagnosed Hashimotos, Graves' disease, or thyroid nodules",
    "Diagnosed PCOS / PCOD, IR-PCOS, or Adrenal PCOS",
    "Post-pill amenorrhea",
    "Excess facial hair growth, male-pattern jawline acne, or androgenic hair thinning",
    "Unexplained breast tissue growth / puffy nipples or fat storage in hips/glutes",
    "Low morning vitality or loss of spontaneous erections",
    "History of TRT, SARMs, or Anabolic Steroids use",
    "Significant mood swings, severe fluid retention, or breast tenderness in the week before menstruation",
    "Perimenopause / Menopause symptoms",
]
SECTION_117_GI_ISSUES = [
    "Diagnosed SIBO or Candida overgrowth",
    "Diagnosed GERD, Hiatal Hernia, or Chronic Gastritis",
    "Diagnosed IBD",
    "Floating, pale, or greasy stools",
    'Severe bloating that worsens progressively as the day goes on',
    "Stomach pain or discomfort relieved immediately after a bowel movement",
    "Frequent dependence on laxatives, antacids, PPIs, or digestive enzymes",
    "History of gallstones or gallbladder removal surgery",
    "History of heavy antibiotic use in the last 1-2 years",
    "Severe discomfort, gas, or brain fog after eating high-FODMAP foods",
]
SECTION_118_IMMUNE_HISTAMINE = [
    "Diagnosed Autoimmune condition",
    "Flushing, sudden nasal congestion, or rapid heart rate after consuming aged cheese, wine, fermented foods, or leftovers",
    "Unexplained joint swelling, morning stiffness lasting >30 minutes, or lingering tendonitis",
    "Dermatographism",
    "Frequent oral cold sores, mouth ulcers, or recurring fungal infections",
    "Severe reactions or allergies to mold, dust mites, or damp environments",
    "Swollen lymph nodes in neck, armpits, or groin without being sick",
]
SECTION_119_ORTHOPEDIC = [
    "Diagnosed Herniated / Bulging / Slipped Disc",
    "Diagnosed Sciatica or shooting nerve pain down legs or arms",
    "Diagnosed Plantar Fasciitis or Achilles Tendonitis",
    "History of shoulder dislocations, labrum tears, or rotator cuff impingement",
    "History of knee ligament injuries",
    "Hypermobility / Ehlers-Danlos Syndrome",
    "Scoliosis, Excessive Kyphosis, or Severe Lordosis",
    "Chronic TMJ / Jaw clicking or clenching at night",
]
SECTION_120_NEURO_SLEEP = [
    "Diagnosed ADHD, ADD, or Autism Spectrum conditions",
    'Chronic feeling of "wired but tired"',
    "Dizziness, lightheadedness, or blacked-out vision when standing up quickly",
    "Restless Leg Syndrome",
    "Diagnosed Sleep Apnea or chronic mouth-breathing during sleep",
    "Teeth grinding or sore jaw muscles upon waking",
    "Frequent migraines or tension headaches triggered by light, stress, or specific foods",
    "History of concussion or traumatic brain injury",
]
SECTION_121_MOVEMENT_LIMITATION = [
    "Poor ankle mobility",
    "Flat feet or fallen arches",
    "Knock knees or bow-legs",
    "Hip tightness",
    "Difficulty squatting below parallel",
    "Lower-back tightness during day",
    "Limited shoulder mobility",
    "Difficulty raising arms overhead",
    "Clicking/popping joints frequently",
    "Pain during twisting movements",
    "Difficulty balancing on one leg",
    "Weak grip strength",
    "One side of body stronger than the other",
]
SECTION_122_CARDIORESPIRATORY = [
    "Shortness of breath climbing stairs",
    "Chest tightness during physical activity",
    "Rapid heartbeat at rest",
    "Swelling in feet or ankles",
    "Frequent headaches during exertion",
    "Feeling faint when standing quickly",
    "Severe fatigue after mild activity",
]
SECTION_123_GENETIC = [
    "Family history of slow metabolism",
    "Family members with early hair loss",
    "Family members with obesity/diabetes",
    "Family history of thyroid disorders",
    "Family history of hypertension before age 40",
    "Family history of cancer",
]
SECTION_124_METHYLATION = [
    "Sensitivity to caffeine",
    "Feel anxious after coffee",
    "Frequent headaches after strong smells",
    "Can't tolerate alcohol well",
    "Red flush after alcohol",
]
SECTION_125_HORMONE_BRAIN_MOOD = [
    "Strong mood swings after eating",
    "Sudden drop in motivation",
    'Feeling "empty" or unmotivated',
    "Difficulty relaxing mentally",
    'Trouble feeling "reward" or satisfaction',
]
SECTION_126_BREATHING_STRESS = [
    "Chest always feels tight",
    "Breath-holding during daily tasks",
    "Mouth breathing at night",
    "Sigh frequently",
    "Wake up tired even after full sleep",
]
SECTION_127_COGNITIVE = [
    "Forget details frequently",
    "Struggle switching between tasks",
    "Feel mentally slow in mornings",
    "Overthinking causes mental fatigue",
    "Brain fog after meals",
]
SECTION_128_LONGEVITY = [
    "Family history of early aging",
    "Deep wrinkles early",
    "Skin elasticity reduced",
    "Hair greying before 25",
    "Low stamina despite training",
]
SECTION_129_AUTONOMIC = [
    "Calm but low energy",
    "Active but anxious",
    "Overreact to stress",
    "Digestive issues during stress",
]
SECTION_130_FOOD_RESPONSE = [
    "Feel sleepy after rice",
    "Feel bloated after roti/wheat",
    "Energetic after protein foods",
    "Irritated after sugar",
    "Hungry soon after fruit",
    "Feel mentally sharp after fats",
]
SECTION_131_HISTAMINE_MEALS = [
    "Runny nose after eating",
    "Red ears after meals",
    "Itchy skin after spicy food",
    "Sneezing after chocolate",
    "Hives or redness randomly",
    "Bloating after fermented foods",
]
SECTION_132_OXYGEN_FITNESS = [
    "Feel breathless faster than others",
    "Legs burn early during walks",
    "Slow post-workout heart rate drop",
    "Sweat less than normal",
    "Sweat too much",
]
SECTION_133_EMOTIONAL_STRESS = [
    "Stress leads to overeating",
    "Stress kills appetite",
    "Conflict makes me shut down",
    "I freeze under pressure",
    "I get angry easily under stress",
    "I mentally overthink before workouts",
    "I lose confidence quickly",
]
SECTION_134_BEHAVIORAL_PATTERNS = [
    "Perfectionist mindset",
    "All-or-nothing behavior",
    "Give up early when progress stops",
    "Start strong but consistency slips",
    "Need external push",
    "Do well with freedom, not pressure",
    "Fear of gym environment",
]
SECTION_135_STRESS_RECOVERY = [
    "I calm down quickly after stress",
    "I stay stressed for hours",
    "I get over situations fast",
    "I need time to settle after arguments",
    "Small things disturb me for long",
    "I can't sleep after emotional stress",
]
SECTION_136_GUT_BRAIN = [
    "Mood worsens when stomach is upset",
    "Anxiety increases when bloated",
    "Feel low when constipated",
    "Cravings increase when stressed",
    "Digestion slows during travel",
    "Brain fog whenever bloated",
]
SECTION_137_HYDRATION_MINERALS = [
    "Urine dark yellow regularly",
    "Feel dizzy when dehydrated",
    "Swelling after salty meals",
    "Headaches improve after water",
    "Dry mouth all day",
]
SECTION_138_TEMPERATURE = [
    "Feel cold when others are fine",
    "Sweat too much in normal temperature",
    "Heat intolerance",
    "Cold intolerance",
    "Extreme temperature sensitivity",
    "Hands/feet always cold",
]
SECTION_139_METABOLIC_WARNING = [
    "Sudden belly fat despite diet",
    "Strong cravings at night",
    "Extreme hunger morning/evening",
    "High thirst at night",
    "Frequent urination",
]
SECTION_140_HORMONAL_SYMPTOMS = [
    "Constant fatigue even after sleeping",
    "Sudden weight gain or unexplained fat gain",
    "Sudden hair thinning",
    "Excessive hair growth",
    "Frequent mood swings",
    "Low recovery after workouts",
    "Always feeling cold",
    "Always feeling hot",
    "Irregular hunger patterns",
    "Sugar or carb crashes",
]
SECTION_141_DIGESTION_ADVANCED = [
    "Frequent burping",
    "Abdominal tightness after meals",
    "Food sitting heavy in stomach",
    "Sudden urge to poop after eating",
    "Bad taste in mouth on waking",
    "Nausea in the morning",
    "Constipation alternating with diarrhoea",
    "Sticky or greasy stools",
    "Frequent loud stomach growling",
    "Excess gas after dairy or wheat",
    "Pain below ribcage",
]
SECTION_142_AFTERNOON_CRASH = [
    "Extreme tiredness between 2-6 PM",
    "Craving sweets immediately after meals",
    "Feeling shaky if meals delayed",
    "Brain fog after eating carbs",
    "Waking up tired despite 7+ hours sleep",
    "Dry skin or flaky scalp",
    "Unexplained swelling",
]
SECTION_143_HABIT_BARRIERS = [
    "Late-night eating habit",
    "Frequent snacking",
    "Emotional eating",
    "Stress eating",
    "Eating out more than 3x a week",
    "Poor time management",
    "Sleep schedule irregular",
    "Sedentary job with long sitting hours",
    "Travel frequently for work",
    "No fixed mealtime",
]
SECTION_144_MALE_HORMONE = [
    "Morning erections reduced",
    "Loss of drive/motivation",
    "Difficulty building muscle",
    "Decrease in strength over time",
]
SECTION_145_FEMALE_HORMONE = [
    "Heavy periods",
    "Very light periods",
    "Painful ovulation",
    "Acne around jawline",
    "Weight gain around thighs/hips/waist suddenly",
    "Cravings before period",
    "Fatigue during luteal phase",
]
SECTION_146_SKIN_HAIR = [
    "Dry patches on skin",
    "Body or facial pigmentation",
    "Hair fall during brushing",
    "Dandruff or scalp flaking",
    "Dark circles under eyes",
    "Skin easily bruises",
    "Cracked heels",
    "Brittle nails",
]
SECTION_147_BREATHING = [
    "Mouth breathing habit",
    "Difficulty nose breathing",
]
SECTION_147_POSTURE = [
    "Forward head posture",
    "Rounded shoulders",
    "Lower-back arching excessively",
    "Pelvic tilt",
    "Tight chest muscles",
    "Weak upper back",
    "Tight neck muscles",
]
SECTION_148_METABOLIC_WARNING = [
    "Sudden unexplained weight gain",
    "Sudden unexplained weight loss",
    "Swelling in face or hands",
    "Tingling in hands/feet",
    "Joint stiffness in the morning",
    "Cold sensitivity",
    "Heat intolerance",
    "Loss of muscle despite eating well",
    "Excessive water retention",
    "Visible inflammation",
    "Poor wound healing",
]
SECTION_149_BREATHING = [
    "Difficulty breathing through nose",
    "Heavy chest breathing instead of diaphragm",
    "Breathlessness when lying down",
    "Frequent yawning",
    "Feeling low oxygen",
    "Waking up gasping for air",
    "Sleep apnea suspicion",
    "Dry mouth on waking",
]
SECTION_150_ALLERGY_ENVIRONMENT = [
    "Work around chemicals, fumes, or pollution",
    "Live in area with high air pollution",
    "Use plastic bottles for hot water often",
    "Reheat food in plastic containers",
    "Use non-stick pans with scratches",
    "Drink unfiltered water",
    "Exposure to second-hand smoke",
    "Mold/dampness in the home",
]
SECTION_151_RECOVERY = [
    "Sore for more than 3 days after workouts",
    "Struggle to recover from leg day",
    "High heart rate during light activity",
    "Feel mentally drained after training",
    "Low motivation next day after workout",
    "Crave sugar after heavy workout",
    "Sleep worsens after intense sessions",
]
SECTION_152_BLOOD_MARKERS = [
    "Shortness of breath on mild activity",
    "Tongue looking smooth/pale",
    "Craving dirt/clay/paper",
    "Headaches frequently",
    "Weakness during mornings",
    "Nails spoon-shaped",
    "Eyebrow thinning at edges",
    "Hoarse or deepened voice",
    "Swollen throat/neck area",
    "Irregular heartbeat",
    "Feeling depressed or low",
    "Sudden anxiety/panic episodes",
    "Bitter taste in mouth",
    "Feeling full quickly",
    "Bloating in upper abdomen",
    "Red palms",
    "Spider veins on skin",
    "Strong smell in stool",
    "Itchy skin with no rash",
    "Urine very foamy or bubbly",
    "Blood pressure fluctuates often",
    "Swelling in hands after salty foods",
    "Extreme hunger suddenly",
    "Tingling around mouth",
    "Frequent infections",
    "Very slow fat loss despite low calories",
    "Feeling dehydrated even after drinking",
    "Skin feels hot in certain areas",
    "Joints cracking/stiff frequently",
    "Chronic sinus congestion",
    "Puffy lower eyelids",
    "Sweating on forehead easily",
    "Weak immunity",
    "Lower back pain that worsens when pressing bones",
    "Heart beating fast after climbing few stairs",
    "Pale lips",
    "Mood swings or irritability",
    "Pins & needles sensation",
    "Difficulty focusing",
    "Feeling faint after standing",
    "Leg twitching at night",
    "Constipation with cramps",
    "Irregular heartbeat after stress",
    "Excessive thirst after exercise",
    "Salt cravings",
    "Shaking hands under stress",
    "Sudden anger bursts",
    "Afternoon energy crash",
    "Difficulty waking up",
    "Fat gain around chest for males",
    "Water retention around hips/thighs",
    "Acne on jawline/chin",
    "Mood crashes before sleeping",
    "Chronic bloating around ovulation/period",
    "Body temperature often low",
    "Loss of appetite",
    "Excessive sweating without heat",
    "Skin darkening in random patches",
    "Sudden allergy-like reactions",
    "Frequent muscle loss despite training",
    "Craving salty foods",
    "Craving sour foods",
    "Craving spicy foods often",
    "White spots on nails",
    "Weak immunity",
    "Lips turn slightly blue in cold",
    "Fingers turn white in cold",
    "Feeling breathless lying flat",
    "Cold sweat episodes",
    "Skin bruises easily",
    "Tiny red dots on skin - petechiae",
    "Dark circles even with sleep",
    "Itchy skin after hot shower",
]
SECTION_153_INFLAMMATION_IMMUNE = [
    "Frequent sore throat",
    "Puffy face especially in morning",
    "Random body aches without reason",
    "Redness around eyes",
    "Skin rashes without allergy",
    "Chronic fatigue",
    "Unexplained low-grade fever",
    "Sensitivity to chemicals",
]
SECTION_154_MENTAL_LOAD = [
    "Easily overwhelmed",
    "Difficulty making decisions",
    "Trouble concentrating",
    "Temporary memory lapses",
    "Feeling wired but tired",
    "Sudden anger or irritability",
    "Anxiety before workouts",
    "Overthinking health/fitness",
    'Feeling "burnt out" even after sleep',
]
SECTION_155_CARDIORESPIRATORY = [
    "TIA",
    "Stroke",
    "Angina or Chest Pain",
    "Heart Attack or Heart Disease",
    "High or Low Blood Pressure",
    "Vascular Disease",
    "High Cholesterol",
    "Shortness of Breath during light activity",
    "Asthma or Breathing Difficulties",
]
SECTION_155_ENDOCRINE = [
    "Diabetes",
    "Hypothyroidism / Hyperthyroidism",
    "Hormonal Imbalances",
]
SECTION_155_ORTHOPEDIC = [
    "Hernia",
    "Chronic Back Pain or Slip Disc",
    "Knee, Shoulder, Neck, or Other Joint Injuries",
]
SECTION_156_CARDIORESPIRATORY = [
    "Any Heart Condition",
    "Asthma",
    "High Blood Pressure",
    "High Cholesterol",
    "Stroke",
]
SECTION_156_ENDOCRINE = [
    "Elevated glucose levels",
    "Elevated insulin levels",
    "Thyroid Condition",
]
SECTION_156_ORTHOPEDIC = [
    "Any Major Injuries",
    "Any Operations",
    "Arthritis",
    "Gout",
    "Hernia",
    "Muscular Pain or Cramps",
]
SECTION_157_ORTHOPEDIC = [
    "Feet",
    "Ankles",
    "Knees",
    "Hips",
    "Wrists",
    "Elbows",
    "Shoulders",
    "Back",
    "Neck",
    "Spinal Cord",
]
SECTION_159_INFLAMMATION_IMMUNE = [
    "Acne",
    "Addiction",
    "Anemia",
    "Anorexia",
    "Diarrhea",
    "Diabetes II",
    "Insomnia",
    "Memory Loss or Confusion",
    "Diabetes I",
    "Mercury fillings",
    "Nails, poor growth",
    "Difficulty Losing Weight",
    "Bladder Infections",
    "Bloating, Gas or Indigestion",
    "Difficulty Gaining Weight",
    "Do you have frequent colonics",
    "Thyroid Conditions",
    "STD's",
    "Blood Sugar Problems",
    "Cold Sores",
    "Fainting",
    "Hair Loss or Poor Hair Growth",
    "Skin Conditions",
    "Suicidal Tendencies",
    "Chronic Fatigue",
    "Headaches/Migraines",
    "IBS or Intestinal Problems",
    "Constipation",
    "Yeast Infections",
    "Seizures",
]
SECTION_160_CARDIORESPIRATORY = [
    "Blood pressure above 140/90",
    "High cholesterol",
    "Family history of heart disease",
    "Do you seldom exercise vigorously?",
]
SECTION_161_FEMALE_CYCLE = [
    "Children",
    "Irregular Periods",
    "Painful Intercourse",
    "Edodemetriosis",
    "Loss of Libido",
    "Painful Periods",
    "Hot flashes",
    "Menopause",
    "Osteoporosis",
    "PMS",
    "Poly-Cystic Ovarian-Syndrome",
    "Hysterectomy",
    "Any other issue?",
]
SECTION_162_MENTAL_LOAD = [
    "Depression",
    "Nervousness",
    "Anxiety",
    "Extreme anger and/or aggressiveness",
]
SECTION_171_UPPER_GI = [
    "Belching or gas within 1 hour of a meal",
    "Heartburn or Acid Reflux",
    "Bloating shortly after eating",
    "Bad breath",
    "Diarrhoea after meals",
    "Stomach upset by taking vitamin supplements",
    "Sense of excess fullness after meals",
    "Hurried eating habits",
    "Anaemia unresponsive to Iron",
    "You feel like skipping breakfast",
    "You feel better if you don't eat",
    "Often sleepy after meals",
    "Fingernails which chip, peel, or break easily",
    "Stomach pains or cramps",
    "Do you use indigestion tablets?",
    "Undigested food in stools",
]
SECTION_172_LARGE_INTESTINE = [
    "Anus itches",
    "Coated tongue",
    "Feel worse in musty or mouldy atmosphere",
    "Stools hard or difficult to pass",
    "History of parasite infection",
    "Cramps in lower abdominal region",
    "Less than 1 bowel movement per day",
    "Stools loose or not well formed",
    "Irritable bowel or mucus colitis",
    "Blood in stools",
    "Mucus in stools",
    "Excessive or foul lower bowel gas",
    "Bad breath or strong body odours",
]
SECTION_173_IMMUNE_SYSTEM = [
    "Never get sick",
    "Runny nose",
    "Cough which produces mucus",
    "Frequent infections: ear, sinus, lung, skin, bladder kidney.",
    "Itchy skin or dermatitis",
    "Cysts, boils or rashes",
    "History of Epstein Bar, Mono, Herpes, Shingles, Chronic Fatigue, Hepatitis or other chronic viral condition",
]
SECTION_174_MALE_UROLOGY = [
    "Prostate problems",
    "Difficult to start & stop urine stream",
    "Pain or burning sensation when urinating",
    "Waking regularly to urinate at night",
    "Decreased sexual function",
    "Constipation - chronic",
]
SECTION_175_FEMALE_CYCLE = [
    "Depression during periods",
    "Mood swings associated with periods - PMS",
    "Crave chocolate around periods",
    "Breast tenderness associated with cycle",
    "Excessive menstrual flow",
    "Minimal blood flow during periods",
    "Occasional skipped periods",
    "Breast fibroids - benign masses",
    "Vaginal discharge and itchiness",
    "Vaginal dryness",
    "Excess facial or body hair",
    "Hot Flushes",
    "Endometriosis",
    "Uterine Fibroids",
]
SECTION_176_ADRENAL = [
    "Insomnia",
    "Slow starter in the morning",
    "Feel wired or jittery when drinking coffee",
    "Clench or grind teeth",
    "Calm on the outside, troubled inside",
    "Become dizzy when suddenly standing up",
    "Crave salty foods",
    "Muscles easily fatigued",
    "Chronic fatigue, or feel drowsy often",
    "Afternoon yawning",
    "Afternoon headache",
    "Allergies and /or hives",
]
SECTION_177_THYROID = [
    "Allergic to Iodine",
    "Difficulty gaining weight, even with large appetite",
    "Nervous, emotional, can't work under pressure",
    "Inward trembling",
    "Flush easily",
    "Fast pulse at rest",
    "Intolerance to high temperatures",
    "Mentally sluggish, reduced initiative",
    "Easily fatigued, sleepy during the day",
    "Sensitive to cold - poor circulation",
    "Constipation - chronic",
    "Difficulty losing weight",
    "Loss of lateral third of eyebrow",
    "Seasonal sadness",
]
SECTION_178_SUGAR_HANDLING = [
    "Awaken a few hours after falling asleep, hard to get back to sleep",
    "Crave sweets",
    "Eat desserts or sugary snacks",
    "Binge or uncontrolled eating",
    "Excessive appetite",
    "Crave coffee or sugar in the afternoon",
    "Sleepy in afternoon",
    "Fatigue that is relieved by eating",
    "Headaches if meals are skipped or delayed",
    "Irritable before meals",
    "Shaky if meals are delayed",
    "Family members with diabetes",
    "Frequent thirst",
    "Frequent urination",
]
SECTION_179_ESSENTIAL_FATTY_ACIDS = [
    "Suffer from PMS / PMT",
    "History of infertility",
    "Poor memory & concentration",
    "Suffer from Dry Eyes",
    "Experience excessive thirst or sweating",
    "Dry flaky skin or Dandruff",
]
SECTION_180_VITAMIN_MINERALS = [
    "Vulnerable to insect bites",
    "Numbness tingling or itching in extremities",
    "Depression/Irritable",
    "Worrier, apprehensive, anxious",
    "Easily exhausted",
    "Sore tongue",
    "Pale skin",
    "Muscles easily fatigued",
    "Slow wound healing",
    "Teeth grinding",
    "Wake up without remembering dreams",
    "Small bumps on back of arms",
    "Nosebleeds, or tendency to bruise easily",
    "White spots on fingernails",
    "Strong foot odour",
    "MSG sensitivity",
    "Take contraceptive pill",
    "Sensitive to strong light at night",
    "Bleeding gums, especially when brushing teeth",
    "Muscle cramps",
    "Decreased sense of taste or smell",
]

CHECKLIST_GROUPS = {
    "sleep_recovery": _build_options(SECTION_114_SLEEP_RECOVERY),
    "gut_digestive": _build_options(SECTION_114_GUT_DIGESTIVE),
    "thyroid_autoimmune": _build_options(SECTION_114_THYROID_AUTOIMMUNE),
    "mental_cognitive": _build_options(SECTION_114_MENTAL_COGNITIVE),
    "hormonal_health": _build_options(
        SECTION_116_ENDOCRINE_SIGNALS,
        SECTION_140_HORMONAL_SYMPTOMS,
    ),
    "allergy_environmental": _build_options(
        SECTION_114_ALLERGY_ENVIRONMENTAL,
        SECTION_150_ALLERGY_ENVIRONMENT,
    ),
    "skin_hair": _build_options(SECTION_114_SKIN_HAIR, SECTION_146_SKIN_HAIR),
    "pain_inflammation": _build_options(SECTION_114_PAIN_INFLAMMATION),
    "recovery_biomarkers": _build_options(SECTION_114_RECOVERY_BIOMARKERS, SECTION_151_RECOVERY),
    "blood_sugar_metabolism": _build_options(SECTION_114_BLOOD_SUGAR),
    "breathing_patterns": _build_options(
        SECTION_114_BREATHING,
        SECTION_147_BREATHING,
        SECTION_149_BREATHING,
    ),
    "metabolic_signals": _build_options(SECTION_115_METABOLIC_SIGNALS),
    "endocrine_signals": _build_options(
        SECTION_116_ENDOCRINE_SIGNALS,
        SECTION_155_ENDOCRINE,
        SECTION_156_ENDOCRINE,
    ),
    "gi_issues": _build_options(SECTION_117_GI_ISSUES),
    "immune_histamine": _build_options(SECTION_118_IMMUNE_HISTAMINE),
    "orthopedic": _build_options(
        SECTION_119_ORTHOPEDIC,
        SECTION_155_ORTHOPEDIC,
        SECTION_156_ORTHOPEDIC,
        SECTION_157_ORTHOPEDIC,
    ),
    "neuro_sleep": _build_options(SECTION_120_NEURO_SLEEP),
    "movement_limitation": _build_options(SECTION_121_MOVEMENT_LIMITATION, SECTION_147_POSTURE),
    "cardiorespiratory": _build_options(
        SECTION_122_CARDIORESPIRATORY,
        SECTION_155_CARDIORESPIRATORY,
        SECTION_156_CARDIORESPIRATORY,
        SECTION_160_CARDIORESPIRATORY,
    ),
    "genetic_predisposition": _build_options(SECTION_123_GENETIC),
    "methylation_detox": _build_options(SECTION_124_METHYLATION),
    "hormone_brain_mood": _build_options(SECTION_125_HORMONE_BRAIN_MOOD),
    "breathing_stress": _build_options(SECTION_126_BREATHING_STRESS),
    "cognitive": _build_options(SECTION_127_COGNITIVE),
    "longevity_aging": _build_options(SECTION_128_LONGEVITY),
    "autonomic_nervous": _build_options(SECTION_129_AUTONOMIC),
    "food_response": _build_options(SECTION_130_FOOD_RESPONSE),
    "histamine_meals": _build_options(SECTION_131_HISTAMINE_MEALS),
    "oxygen_fitness": _build_options(SECTION_132_OXYGEN_FITNESS),
    "emotional_stress": _build_options(SECTION_133_EMOTIONAL_STRESS),
    "behavioral_patterns": _build_options(SECTION_134_BEHAVIORAL_PATTERNS),
    "stress_recovery": _build_options(SECTION_135_STRESS_RECOVERY),
    "gut_brain": _build_options(SECTION_136_GUT_BRAIN),
    "hydration_minerals": _build_options(SECTION_137_HYDRATION_MINERALS),
    "temperature_regulation": _build_options(SECTION_138_TEMPERATURE),
    "metabolic_warning": _build_options(SECTION_139_METABOLIC_WARNING, SECTION_148_METABOLIC_WARNING),
    "hormonal_symptoms": _build_options(SECTION_140_HORMONAL_SYMPTOMS),
    "digestion_advanced": _build_options(SECTION_141_DIGESTION_ADVANCED),
    "afternoon_crash": _build_options(SECTION_142_AFTERNOON_CRASH),
    "habit_barriers": _build_options(SECTION_143_HABIT_BARRIERS),
    "blood_marker_symptoms": _build_options(SECTION_152_BLOOD_MARKERS),
    "inflammation_immune": _build_options(
        SECTION_153_INFLAMMATION_IMMUNE,
        SECTION_159_INFLAMMATION_IMMUNE,
    ),
    "mental_load": _build_options(SECTION_154_MENTAL_LOAD, SECTION_162_MENTAL_LOAD),
    "upper_gi": _build_options(SECTION_171_UPPER_GI),
    "large_intestine": _build_options(SECTION_172_LARGE_INTESTINE),
    "immune_system": _build_options(SECTION_173_IMMUNE_SYSTEM),
    "adrenal": _build_options(SECTION_176_ADRENAL),
    "thyroid_symptoms": _build_options(SECTION_177_THYROID),
    "sugar_handling": _build_options(SECTION_178_SUGAR_HANDLING),
    "essential_fatty_acids": _build_options(SECTION_179_ESSENTIAL_FATTY_ACIDS),
    "vitamin_mineral_needs": _build_options(SECTION_180_VITAMIN_MINERALS),
    "male_urology": _build_options(SECTION_144_MALE_HORMONE, SECTION_174_MALE_UROLOGY),
    "female_cycle_symptoms": _build_options(
        SECTION_145_FEMALE_HORMONE,
        SECTION_161_FEMALE_CYCLE,
        SECTION_175_FEMALE_CYCLE,
    ),
}

CRAVING_TIME_OPTIONS = _simple_options(
    "Mid-morning",
    "Late afternoon / Tea time",
    "Immediately after lunch or dinner",
    "Late night / Before bed",
    "During high-stress hours at work",
    "Around my menstrual cycle",
    "Rarely / No specific time",
)
WORK_ENVIRONMENT_OPTIONS = _simple_options(
    "Desk job with prolonged sitting",
    "Hybrid work",
    "Night shift / Rotational shift work",
    "Frequent work-related travel",
    "High physical activity on job",
    "Frequent long driving / commute hours",
    "Irregular sleep schedule due to work/family obligations",
)
SKIN_WITHOUT_LOTION_OPTIONS = _simple_options("Very dry", "Oily", "Dry", "Combination", "Normal")
FOOD_CRAVINGS_OPTIONS = _build_options(
    [
        "Sugar",
        "Chocolate",
        "Meats/Fish",
        "Fried Food",
        "Fat",
        "Alcohol",
        "Desserts",
        "Milk",
        "Bread",
    ]
)
DIET_STYLE_OPTIONS = _simple_options(
    "Low fat",
    "Low carb",
    "Low sugar",
    "Gluten free",
    "Dairy free",
    "Vegetarian",
    "No wheat",
    "High protein",
    "Vegan",
    "Low sodium",
    "Diabetic",
    "Other",
)
WILLING_TO_CHANGE_OPTIONS = _build_options(
    [
        "Significantly modify your diet",
        "Take nutritional supplements each day",
        "Keep a record of everything you eat each day",
        "Modify your lifestyle",
        "Practice relaxation techniques",
        "Engage in regular exercise/physical activity",
        "Have periodic lab tests to assess your progress",
    ]
)


def valid_submit_answers(sex: str) -> dict[str, Any]:
    applicable_groups = {
        key: ["none"]
        for key in CHECKLIST_GROUPS
        if not (
            (sex != "male" and key == "male_urology")
            or (sex != "female" and key == "female_cycle_symptoms")
        )
    }
    payload: dict[str, Any] = {
        "identity": {
            "full_name": "Taylor Example",
            "date_of_birth": "1994-01-15",
            "sex": sex,
            "mobile": "+91 98765 43210",
            "place_of_living": "Pune, Maharashtra",
            "profession": "Software engineer",
        },
        "body": {
            "morning_weight_kg": 82.4,
            "height_cm": 176.0,
            "waist_cm": 84.0,
            "visual_body_fat": "m_15_19" if sex != "female" else "f_22_26",
            "desired_weight_kg": 76.0,
        },
        "logistics": {
            "knows_food_logging": "yes",
            "knows_food_scale": "yes",
            "food_preference": "nonveg_home_and_outside",
            "training_location": "gym",
            "ingredient_quantity": "raw",
            "training_days": "1_5",
            "meals_per_day": 4,
            "veg_days_separate": "no",
            "disliked_foods": "No strong dislikes.",
            "who_cooks": "I cook most meals at home.",
            "supplement_budget_monthly": "3000 INR",
            "workout_time": "6:30 AM",
        },
        "eating_pattern": {
            "breakfast": {"time": "08:00 AM", "foods": "Eggs, toast, and fruit."},
            "mid_morning": {"time": "", "foods": ""},
            "lunch": {"time": "01:00 PM", "foods": "Rice, chicken, dal, and salad."},
            "evening": {"time": "", "foods": ""},
            "dinner": {"time": "08:30 PM", "foods": "Paneer, vegetables, and roti."},
            "late_night": {"time": "", "foods": ""},
        },
        "training": {
            "strength_lifts": "Bench press 60 kg x 8, squat 90 kg x 5, deadlift 120 kg x 5.",
            "equipment": "Commercial gym with barbells, dumbbells, benches, cables, and machines.",
            "dumbbell_increments": "2.5 kg increments.",
            "refused_exercises": "No exercise refusals.",
            "exercise_history": "Consistent lifting for 2 years.",
            "current_program": "Upper/lower split for the last 4 months.",
            "tracks_workouts": "notes_app",
            "joint_flareups": "Occasional tight shoulders after long desk days.",
            "post_workout_routine": "Protein shake, breakfast, and commute to work.",
            "hobbies_sports": "Weekend badminton.",
            "strong_weak_groups": "Strong legs, weaker upper chest.",
            "exercise_familiarity": "Comfortable with standard gym movements and machine setup.",
            "ped_steroids": "No.",
            "muscular_capacity": 3,
            "athletic_ability": 3,
            "flexibility": 3,
            "cardio_ability": 3,
            "exercise_level": "moderate",
            "weekly_exercise_hours": "3_6",
            "dedication_1_to_10": 8,
            "transport": "vehicle",
            "sitting_hours": "8_12",
        },
        "safety": {
            "family_cardiac_or_untrained_age": "No known issues.",
            "hospitalized_recently": "No.",
            "major_surgery_injuries_illness": "No major surgeries or injuries.",
            "other_health_concerns": "No additional concerns.",
            "recent_labs_note": "No recent blood, hair, or stool work.",
            "food_allergies": "No known allergies.",
            "limits_on_activity": "No activity limits.",
            "bone_density_over_50": "Not applicable.",
            "physician_said_no_exercise": "No.",
            "ortho_surgeries": "No.",
            "imaging_mri_xray": "No relevant imaging.",
            "prescription_medication": "No prescription medication.",
            "psych_meds_or_insulin_etc": "No.",
            "blood_pressure_reading": "120/80 mmHg",
            "resting_heart_rate": "62 bpm",
            "snore_or_unrefreshed": "No loud snoring and usually feel rested.",
            "bowel_movements": "One to two consistent movements per day.",
            "current_supplements": "Creatine 5 g daily and whey protein.",
            "fat_burner_history": "No.",
        },
        "lifestyle": {
            "job_and_commute": "Desk job with a 30-minute car commute.",
            "relationship_status": "Single",
            "motivation_when_low": "Accountability and reminders of why I started.",
            "prior_bodycomp_attempts": "I have dieted twice and gained some weight back each time.",
            "why_this_matters": "I want better health, confidence, and long-term consistency.",
            "photoshoot_gift": "Yes, I would celebrate with a photoshoot.",
            "life_events": "No major events affecting training right now.",
            "disordered_eating": "No past disordered eating history.",
            "body_feeling": "slightly_unhappy",
            "nightmares": "",
            "non_scale_victory": "Better stamina during weekend sports.",
            "caloric_drinks": "One sweet coffee most days.",
            "delivery_or_eat_out": "1 to 2 times per week.",
            "must_have_foods": "Eggs, rice, and dark chocolate.",
            "religious_fasting": "No regular fasting.",
            "work_shift_pattern": "Standard 9-5 workdays.",
            "hours_to_first_meal": "1 hour",
            "weekend_vs_weekday": "Weekends are slightly later for sleep and meals.",
            "stopped_previous_programs": "Travel and poor planning interrupted consistency.",
            "craving_triggers": "Stress and boredom at night.",
            "one_year_vision": "Lean, strong, and training consistently.",
            "priority_goals": "Lose fat, build muscle, and improve energy.",
            "what_kept_you": "I kept postponing until work calmed down.",
            "religious_cultural_diet": "No special restrictions.",
            "sleep_quality_1_to_10": 7,
            "sleep_notes": "Usually asleep by 11 PM and up around 6:30 AM.",
            "weekday_sleep_hours": "6_7",
            "weekend_sleep_hours": "7_8",
            "energy_1_to_10": 7,
            "energy_notes": "Best focus in the morning, dip in late afternoon.",
            "libido_energy": "Normal.",
            "fat_storage_areas": "Lower abdomen and waist.",
            "days_you_will_not_show_up": "I will still do the minimum effective session.",
            "excuses_and_plan": "I will pre-plan meals and shorten workouts if work runs late.",
            "burnout_or_anxiety": "No major burnout currently.",
            "mental_health_diagnosis": "No formal diagnosis.",
            "success_definition": "Dropping body fat while staying consistent for months.",
            "family_support": "Family is supportive.",
            "people_who_discourage": "No one actively discourages me.",
            "work_stress_limits": "Sometimes, but I can still train with planning.",
            "smoking": "No smoking history.",
            "alcohol": "Occasional social drinking.",
            "online_training_history": "I tried one online plan for 3 months.",
            "three_habit_changes": "Better meal prep, consistent sleep, and daily steps.",
            "craving_times": ["rarely_no_specific_time"],
            "work_environment": ["desk_job_with_prolonged_sitting"],
            "lifestyle_activity": "light",
            "water_intake": "1_3l",
            "diet_styles": ["high_protein"],
            "willing_to_change": ["significantly_modify_your_diet"],
            "skin_without_lotion": "normal",
            "food_cravings_list": ["none"],
            "milestone_celebration": "A photoshoot and a weekend trip.",
            "anything_else": "",
        },
        "checklists": applicable_groups,
        "sex_specific": {},
        "waiver": {"accepted": True},
    }
    if sex == "female":
        payload["sex_specific"] = {
            "pregnant": "no",
            "birth_control": "No hormonal birth control.",
            "last_cycle_start": "2026-09-01",
            "last_cycle_unknown": False,
            "cycle_energy_drops": "No major energy drops.",
            "periods_regular": "Usually regular 28-30 day cycles.",
            "perimenopause": "No.",
        }
    elif sex == "male":
        payload["sex_specific"] = {
            "deficit_drive": "Drive stays normal in a mild calorie deficit.",
            "trt_or_hormones": "No TRT or hormone use.",
            "testosterone_tested_last_year": "No.",
        }
    else:
        payload["sex_specific"] = {"note": ""}
    return deepcopy(payload)


def attention_flags(answers: dict[str, Any] | Any) -> list[str]:
    if hasattr(answers, "model_dump"):
        payload = answers.model_dump(mode="json")
    else:
        payload = answers
    flags: list[str] = []
    sex = payload.get("identity", {}).get("sex")
    sex_specific = payload.get("sex_specific", {})
    if sex == "female" and sex_specific.get("pregnant") in {"yes", "unsure"}:
        flags.append("reported_pregnancy")
    physician = str(payload.get("safety", {}).get("physician_said_no_exercise", "")).strip()
    if physician and physician.casefold() != "no":
        flags.append("physician_said_no_exercise")
    return flags
