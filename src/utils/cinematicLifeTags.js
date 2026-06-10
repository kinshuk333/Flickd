const TAGGER_VERSION = 'v2';

const TAXONOMY = {
  setting: [
    'high_school', 'college_campus', 'boarding_school', 'small_town', 'countryside', 'village', 'big_city',
    'new_york_city', 'lonely_city', 'suburbia', 'old_house', 'apartment_life', 'road_journey', 'workplace',
    'courtroom', 'police_station', 'hospital', 'prison', 'military_base', 'war_zone', 'religious_space',
    'theatre_world', 'film_industry', 'music_world', 'sports_world', 'criminal_underworld', 'political_world',
    'royal_family', 'hotel_life', 'train_journey', 'island_setting', 'coastal_town', 'desert_landscape',
    'mountain_landscape', 'rainy_city', 'night_city',
  ],
  life_stage: [
    'childhood', 'adolescence', 'teenage_life', 'high_school_life', 'college_years', 'early_adulthood',
    'midlife_crisis', 'old_age', 'married_life', 'parenthood', 'single_life', 'widowhood', 'retirement',
    'coming_of_age', 'loss_of_innocence', 'first_love', 'first_job', 'returning_home', 'leaving_home',
  ],
  social_world: [
    'extended_family', 'nuclear_family', 'broken_family', 'mother_child', 'father_child', 'siblings', 'marriage',
    'divorce', 'friend_group', 'male_friendship', 'female_friendship', 'teenage_girls', 'mentor_student',
    'teacher_student', 'romantic_couple', 'love_triangle', 'community_network', 'neighbourhood_life',
    'chosen_family', 'intergenerational_conflict', 'family_secret', 'inheritance_conflict', 'domestic_life',
    'household_tension',
  ],
  social_context: [
    'working_class', 'middle_class', 'upper_class', 'poverty', 'wealth', 'class_mobility', 'rural_poverty',
    'urban_poverty', 'elite_world', 'bureaucracy', 'institutional_life', 'institutional_barriers',
    'traditional_society', 'modernity_clash', 'immigrant_life', 'diaspora', 'minority_experience',
    'outsider_in_society', 'patriarchal_world', 'religious_community', 'tribal_or_indigenous_world',
    'postcolonial_world', 'reproductive_choice',
  ],
  story_situation: [
    'returning_home', 'family_gathering', 'wedding_event', 'funeral_event', 'reunion', 'trial_or_investigation',
    'journey_for_help', 'journey_with_strangers', 'survival_situation', 'revenge_path', 'heist_or_plan',
    'forbidden_love', 'secret_life', 'double_identity', 'fall_from_grace', 'rise_to_power', 'escape_attempt',
    'missing_person', 'murder_investigation', 'political_conspiracy', 'social_scandal', 'artist_struggle',
    'sports_competition', 'exam_pressure', 'school_rivalry', 'village_conflict', 'inheritance_dispute',
    'caregiving', 'terminal_illness', 'war_survival', 'migration_journey', 'unintended_pregnancy', 'medical_help',
  ],
  tone_texture: [
    'slow_burn', 'melancholic', 'warm', 'bleak', 'playful', 'absurd', 'satirical', 'quiet', 'intense',
    'dreamlike', 'realist', 'poetic', 'nostalgic', 'claustrophobic', 'meditative', 'chaotic', 'violent',
    'tender', 'romantic', 'cynical', 'spiritual', 'mysterious', 'atmospheric',
  ],
  emotional_moral_theme: [
    'grief', 'guilt', 'regret', 'loneliness', 'longing', 'desire', 'jealousy', 'betrayal', 'forgiveness',
    'sacrifice', 'obsession', 'moral_ambiguity', 'justice', 'corruption', 'shame', 'identity_confusion',
    'emotional_repression', 'alienation', 'hope', 'disillusionment', 'vulnerability', 'female_interiority',
  ],
  plot_keyword: [],
};

const IMPORTANCE_WEIGHT = { primary: 1, secondary: 0.65, fallback: 0.35 };
const TYPE_LABELS = {
  setting: 'Worlds You Return To',
  life_stage: 'Life Stages That Pull You In',
  social_world: 'Social Situations You Reward',
  story_situation: 'Social Situations You Reward',
  tone_texture: 'Emotional Textures',
  emotional_moral_theme: 'Emotional Textures',
  plot_keyword: 'Plot Keywords',
};

const compact = (value) => String(value || '').replace(/_/g, ' ');
const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .replace(/[’']/g, "'")
  .replace(/[^a-z0-9\s'-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const hasAny = (text, phrases = []) => phrases.some((phrase) => text.includes(normalizeText(phrase)));
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const normalize = (value, min, max) => clamp(((Number(value) || 0) - min) / Math.max(1, max - min) * 100);

const PLOT_KEYWORD_STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'along', 'also', 'amid', 'among', 'around', 'away', 'because',
  'been', 'being', 'between', 'both', 'case', 'comes', 'down', 'during', 'each', 'find', 'found',
  'from', 'gets', 'goes', 'have', 'having', 'into', 'just', 'life', 'like', 'more', 'must',
  'multiple', 'only', 'over', 'small', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'through', 'under',
  'until', 'upon', 'when', 'where', 'while', 'with', 'without', 'young',
  'the', 'and', 'for', 'that', 'his', 'her', 'she', 'him', 'who', 'two', 'one', 'its', 'are',
  'was', 'were', 'has', 'had', 'but', 'not', 'you', 'all', 'own', 'out', 'new',
]);
const PLOT_KEYWORD_ALIASES = new Map([
  ['korean', 'korea'],
  ['south_korean', 'korea'],
  ['raped', 'rape'],
  ['rapes', 'rape'],
  ['murdered', 'murder'],
  ['murders', 'murder'],
  ['detective', 'detectives'],
  ['culprits', 'culprit'],
]);
const PLOT_KEYWORD_PHRASES = [
  ['young_women', ['young women', 'young woman']],
  ['sexual_violence', ['raped', 'rape', 'sexual assault', 'sexually assaulted']],
  ['serial_murder', ['serial killer', 'multiple murders', 'multiple young women', 'raped and murdered']],
  ['unknown_culprit', ['unknown culprit', 'unknown killer', 'unknown murderer']],
  ['korea', ['korean', 'south korean', 'korea']],
];
const keywordTag = (value) => {
  const normalized = normalizeText(value).replace(/-/g, ' ').replace(/\s+/g, '_');
  return PLOT_KEYWORD_ALIASES.get(normalized) || normalized;
};
const extractPlotKeywordTags = (plot = '') => {
  const text = normalizeText(plot);
  if (!text) return [];
  const keywords = new Map();
  const addKeyword = (tag, reason, confidence = 0.82) => {
    const safeTag = keywordTag(tag);
    if (!safeTag || safeTag.length < 2 || PLOT_KEYWORD_STOPWORDS.has(safeTag)) return;
    if (!keywords.has(safeTag)) keywords.set(safeTag, { tag: safeTag, reason, confidence });
  };

  PLOT_KEYWORD_PHRASES.forEach(([tag, phrases]) => {
    const phrase = phrases.find((candidate) => hasAny(text, [candidate]));
    if (phrase) addKeyword(tag, `Plot keyword phrase: ${phrase}.`, 0.9);
  });

  const words = text.split(/\s+/).filter(Boolean);
  words.forEach((word) => {
    const safe = keywordTag(word);
    if (/^\d{4}$/.test(safe)) {
      addKeyword(safe, `Plot mentions ${safe}.`, 0.86);
      return;
    }
    if (safe.length < 4 || PLOT_KEYWORD_STOPWORDS.has(safe)) return;
    addKeyword(safe, `Plot keyword: ${word}.`, 0.78);
  });

  words.forEach((word, index) => {
    const first = keywordTag(word);
    const second = keywordTag(words[index + 1] || '');
    if (!first || !second || first.length < 4 || second.length < 4) return;
    if (PLOT_KEYWORD_STOPWORDS.has(first) || PLOT_KEYWORD_STOPWORDS.has(second)) return;
    addKeyword(`${first}_${second}`, `Plot keyword phrase: ${word} ${words[index + 1]}.`, 0.84);
  });

  return Array.from(keywords.values()).slice(0, 30);
};

const RULES = [
  ['high_school', 'setting', ['high school', 'school student', 'classmate', 'school life']],
  ['high_school_life', 'life_stage', ['high school', 'school years', 'school student', 'teenage student']],
  ['college_campus', 'setting', ['college', 'university', 'campus']],
  ['college_years', 'life_stage', ['college', 'university', 'campus']],
  ['countryside', 'setting', ['rural', 'countryside', 'farm', 'remote village', 'rural town']],
  ['village', 'setting', ['village', 'remote village']],
  ['small_town', 'setting', ['small town', 'quiet town', 'provincial town']],
  ['new_york_city', 'setting', ['new york', 'new york city', 'nyc', 'manhattan', 'brooklyn']],
  ['big_city', 'setting', ['city', 'metropolis', 'urban']],
  ['lonely_city', 'setting', ['lonely city', 'alone in the city', 'isolated in the city']],
  ['old_house', 'setting', ['old house', 'ancestral home', 'family home', 'mansion']],
  ['apartment_life', 'setting', ['apartment', 'flatmate', 'roommate']],
  ['road_journey', 'setting', ['road trip', 'on the road', 'cross-country journey']],
  ['train_journey', 'setting', ['train', 'railway journey']],
  ['courtroom', 'setting', ['court', 'trial', 'lawyer', 'judge']],
  ['police_station', 'setting', ['police', 'detective', 'officer']],
  ['hospital', 'setting', ['hospital', 'clinic', 'doctor', 'treatment']],
  ['criminal_underworld', 'setting', ['gangster', 'mafia', 'underworld', 'criminal empire']],
  ['political_world', 'setting', ['politician', 'campaign', 'government', 'political']],
  ['adolescence', 'life_stage', ['teenage', 'teenager', 'adolescent', 'youth']],
  ['teenage_life', 'life_stage', ['teenage', 'teenager', 'teen girls', 'teen boys']],
  ['teenage_girls', 'social_world', ['teenage girls', 'teen girls', 'two girls']],
  ['female_friendship', 'social_world', ['female friendship', 'two girls', 'best friends', 'her friend', 'friends travel', 'young women travel together']],
  ['extended_family', 'social_world', ['extended family', 'large family', 'relatives', 'family gathering', 'clan']],
  ['family_gathering', 'story_situation', ['family gathering', 'reunion', 'wedding', 'funeral', 'family comes together']],
  ['returning_home', 'life_stage', ['returns home', 'return home', 'back to his hometown', 'back to her hometown']],
  ['returning_home', 'story_situation', ['returns home', 'return home', 'back to his hometown', 'back to her hometown']],
  ['leaving_home', 'life_stage', ['leaves home', 'leaving home', 'runs away from home']],
  ['coming_of_age', 'life_stage', ['coming of age', 'grows up', 'loss of innocence']],
  ['loss_of_innocence', 'life_stage', ['loss of innocence', 'innocence is lost']],
  ['first_love', 'life_stage', ['first love', 'first romance']],
  ['friend_group', 'social_world', ['group of friends', 'friend group', 'friends']],
  ['mother_child', 'social_world', ['mother and daughter', 'mother and son', 'single mother']],
  ['father_child', 'social_world', ['father and daughter', 'father and son', 'single father']],
  ['siblings', 'social_world', ['siblings', 'brother', 'sister']],
  ['marriage', 'social_world', ['marriage', 'married couple', 'husband', 'wife']],
  ['divorce', 'social_world', ['divorce', 'separation', 'separated couple']],
  ['household_tension', 'social_world', ['household tension', 'domestic tension', 'troubled household', 'family conflict']],
  ['intergenerational_conflict', 'social_world', ['generation gap', 'intergenerational', 'father clashes', 'mother clashes']],
  ['family_secret', 'social_world', ['family secret', 'hidden family', 'dark secret']],
  ['inheritance_conflict', 'social_world', ['inheritance', 'will', 'estate dispute']],
  ['working_class', 'social_context', ['working class', 'factory worker', 'blue collar', 'poor family', 'struggling family']],
  ['poverty', 'social_context', ['poor', 'poverty', 'financial struggle', 'struggling to survive']],
  ['rural_poverty', 'social_context', ['rural poverty', 'poor village', 'poor farmer']],
  ['urban_poverty', 'social_context', ['urban poverty', 'slum', 'inner city poverty']],
  ['bureaucracy', 'social_context', ['bureaucracy', 'bureaucratic', 'paperwork', 'officials']],
  ['institutional_life', 'social_context', ['institution', 'school', 'prison', 'hospital', 'military']],
  ['institutional_barriers', 'social_context', ['barriers', 'denied', 'bureaucracy', 'clinic', 'institution', 'legal restriction', 'system', 'official']],
  ['reproductive_choice', 'social_context', ['pregnancy', 'abortion', 'reproductive', 'medical help after pregnancy']],
  ['patriarchal_world', 'social_context', ['patriarchal', 'male-dominated', 'strict father']],
  ['religious_community', 'social_context', ['religious community', 'church', 'temple', 'mosque', 'priest']],
  ['outsider_in_society', 'social_context', ['outsider', 'outcast', 'misfit', 'does not fit in']],
  ['immigrant_life', 'social_context', ['immigrant', 'migration', 'new country']],
  ['diaspora', 'social_context', ['diaspora', 'exile', 'immigrant family']],
  ['journey_for_help', 'story_situation', ['travel to seek help', 'journey to seek help', 'seek medical help', 'seek out medical help', 'travel for treatment', 'goes to the city for help']],
  ['journey_with_strangers', 'story_situation', ['journey with strangers', 'travels with strangers']],
  ['unintended_pregnancy', 'story_situation', ['unintended pregnancy', 'unexpected pregnancy', 'pregnant teenager', 'teen pregnancy']],
  ['medical_help', 'story_situation', ['medical help', 'doctor', 'clinic', 'hospital', 'treatment']],
  ['murder_investigation', 'story_situation', ['murder investigation', 'detective', 'serial killer', 'investigate a murder']],
  ['trial_or_investigation', 'story_situation', ['trial', 'investigation', 'detective', 'court case']],
  ['missing_person', 'story_situation', ['missing person', 'disappears', 'vanishes']],
  ['revenge_path', 'story_situation', ['revenge', 'vengeance']],
  ['heist_or_plan', 'story_situation', ['heist', 'robbery', 'elaborate plan']],
  ['forbidden_love', 'story_situation', ['forbidden love', 'forbidden romance']],
  ['secret_life', 'story_situation', ['secret life', 'hidden identity']],
  ['double_identity', 'story_situation', ['double life', 'double identity']],
  ['rise_to_power', 'story_situation', ['rise to power', 'becomes powerful']],
  ['fall_from_grace', 'story_situation', ['fall from grace', 'downfall']],
  ['exam_pressure', 'story_situation', ['exam pressure', 'exams', 'entrance exam']],
  ['school_rivalry', 'story_situation', ['school rivalry', 'rival school']],
  ['village_conflict', 'story_situation', ['village conflict', 'village feud']],
  ['caregiving', 'story_situation', ['caregiving', 'caretaker', 'cares for']],
  ['terminal_illness', 'story_situation', ['terminal illness', 'dying of', 'cancer diagnosis']],
  ['war_survival', 'story_situation', ['survive the war', 'war survival']],
  ['migration_journey', 'story_situation', ['migration journey', 'migrate', 'crosses the border']],
  ['quiet', 'tone_texture', ['quiet', 'understated', 'subtle', 'minimal', 'intimate']],
  ['realist', 'tone_texture', ['realistic', 'naturalistic', 'social realist', 'ordinary life', 'everyday']],
  ['melancholic', 'tone_texture', ['melancholy', 'sad', 'sorrow', 'loss', 'lonely']],
  ['vulnerability', 'emotional_moral_theme', ['vulnerable', 'alone', 'seeks help', 'at risk', 'unsupported']],
  ['female_interiority', 'emotional_moral_theme', ['young woman', 'teenage girl', 'her inner life', 'female perspective', "woman's experience"]],
  ['moral_ambiguity', 'emotional_moral_theme', ['moral dilemma', 'difficult choice', 'grey area', 'ethical']],
  ['justice', 'emotional_moral_theme', ['justice', 'trial', 'court', 'crime', 'law']],
  ['corruption', 'emotional_moral_theme', ['corrupt', 'bribe', 'politician', 'mafia', 'scandal']],
  ['grief', 'emotional_moral_theme', ['grief', 'mourning', 'death of']],
  ['loneliness', 'emotional_moral_theme', ['lonely', 'alone', 'isolated']],
  ['betrayal', 'emotional_moral_theme', ['betrayal', 'betrayed']],
  ['hope', 'emotional_moral_theme', ['hope', 'hopeful']],
];

const GENRE_FALLBACKS = [
  ['Drama', 'realist', 'tone_texture', 'fallback', 0.56, 'Drama genre suggests grounded human conflict.'],
  ['Drama', 'quiet', 'tone_texture', 'fallback', 0.52, 'Drama genre can support an intimate understated tone when plot data is thin.'],
  ['Drama', 'vulnerability', 'emotional_moral_theme', 'fallback', 0.48, 'Drama genre often centers emotional exposure or difficult human stakes.'],
  ['Drama', 'moral_ambiguity', 'emotional_moral_theme', 'fallback', 0.45, 'Drama genre can support morally complex choices when plot detail is limited.'],
  ['Comedy', 'playful', 'tone_texture', 'fallback', 0.6, 'Comedy genre suggests playfulness.'],
  ['Comedy', 'warm', 'tone_texture', 'fallback', 0.5, 'Comedy genre can support warmth or social ease.'],
  ['Horror', 'bleak', 'tone_texture', 'fallback', 0.64, 'Horror genre suggests bleakness or fear.'],
  ['Horror', 'mysterious', 'tone_texture', 'fallback', 0.56, 'Horror genre often relies on mystery or uncertainty.'],
  ['Horror', 'claustrophobic', 'tone_texture', 'fallback', 0.5, 'Horror genre can create a trapped or pressured texture.'],
  ['Thriller', 'intense', 'tone_texture', 'fallback', 0.64, 'Thriller genre suggests intensity.'],
  ['Thriller', 'mysterious', 'tone_texture', 'fallback', 0.58, 'Thriller genre often depends on hidden information.'],
  ['Thriller', 'moral_ambiguity', 'emotional_moral_theme', 'fallback', 0.48, 'Thriller genre can involve compromised choices or unclear motives.'],
  ['Crime', 'murder_investigation', 'story_situation', 'fallback', 0.54, 'Crime genre suggests investigation or criminal conflict.'],
  ['Crime', 'police_station', 'setting', 'fallback', 0.48, 'Crime genre can involve police or investigative spaces.'],
  ['Crime', 'justice', 'emotional_moral_theme', 'fallback', 0.52, 'Crime genre often turns on justice, law, or consequence.'],
  ['Crime', 'criminal_underworld', 'setting', 'fallback', 0.5, 'Crime genre can point to criminal networks or hidden social worlds.'],
  ['Romance', 'romantic', 'tone_texture', 'fallback', 0.62, 'Romance genre suggests romantic texture.'],
  ['Romance', 'romantic_couple', 'social_world', 'fallback', 0.54, 'Romance genre suggests a central romantic bond.'],
  ['Romance', 'longing', 'emotional_moral_theme', 'fallback', 0.5, 'Romance genre often carries longing or desire.'],
  ['War', 'war_zone', 'setting', 'fallback', 0.58, 'War genre suggests wartime setting.'],
  ['War', 'war_survival', 'story_situation', 'fallback', 0.56, 'War genre suggests survival under conflict.'],
  ['War', 'sacrifice', 'emotional_moral_theme', 'fallback', 0.5, 'War genre often involves sacrifice or consequence.'],
  ['Animation', 'dreamlike', 'tone_texture', 'fallback', 0.52, 'Animation genre can suggest stylized or dreamlike texture.'],
  ['Animation', 'playful', 'tone_texture', 'fallback', 0.48, 'Animation genre can support playful visual energy.'],
  ['Family', 'nuclear_family', 'social_world', 'fallback', 0.56, 'Family genre suggests household or family bonds.'],
  ['Family', 'parenthood', 'life_stage', 'fallback', 0.5, 'Family genre can involve parenting or caregiving roles.'],
  ['Family', 'warm', 'tone_texture', 'fallback', 0.5, 'Family genre can support warmth.'],
  ['Action', 'intense', 'tone_texture', 'fallback', 0.62, 'Action genre suggests intensity and urgency.'],
  ['Action', 'violent', 'tone_texture', 'fallback', 0.52, 'Action genre can involve physical conflict.'],
  ['Action', 'survival_situation', 'story_situation', 'fallback', 0.48, 'Action genre often turns on danger or survival.'],
  ['Adventure', 'road_journey', 'setting', 'fallback', 0.5, 'Adventure genre often involves movement through places.'],
  ['Adventure', 'journey_with_strangers', 'story_situation', 'fallback', 0.46, 'Adventure genre can involve unlikely travel companions.'],
  ['Adventure', 'hope', 'emotional_moral_theme', 'fallback', 0.44, 'Adventure genre can carry aspiration or hope.'],
  ['Mystery', 'mysterious', 'tone_texture', 'fallback', 0.64, 'Mystery genre suggests hidden information.'],
  ['Mystery', 'trial_or_investigation', 'story_situation', 'fallback', 0.58, 'Mystery genre suggests investigation.'],
  ['Mystery', 'justice', 'emotional_moral_theme', 'fallback', 0.48, 'Mystery genre often involves truth or justice.'],
  ['Documentary', 'realist', 'tone_texture', 'fallback', 0.66, 'Documentary genre suggests realist texture.'],
  ['Documentary', 'institutional_life', 'social_context', 'fallback', 0.42, 'Documentary genre can examine systems, communities, or institutions.'],
  ['Biography', 'early_adulthood', 'life_stage', 'fallback', 0.42, 'Biography genre often traces formative life phases.'],
  ['Biography', 'artist_struggle', 'story_situation', 'fallback', 0.44, 'Biography genre can involve a life project or personal struggle.'],
  ['Biography', 'identity_confusion', 'emotional_moral_theme', 'fallback', 0.42, 'Biography genre can involve identity formation or self-definition.'],
  ['History', 'traditional_society', 'social_context', 'fallback', 0.44, 'History genre can involve older social orders or inherited worlds.'],
  ['History', 'political_world', 'setting', 'fallback', 0.42, 'History genre can involve public power or political change.'],
  ['Sci-Fi', 'dreamlike', 'tone_texture', 'fallback', 0.46, 'Sci-fi genre can create speculative or dreamlike texture.'],
  ['Sci-Fi', 'moral_ambiguity', 'emotional_moral_theme', 'fallback', 0.44, 'Sci-fi genre often tests ethical boundaries.'],
  ['Fantasy', 'dreamlike', 'tone_texture', 'fallback', 0.58, 'Fantasy genre suggests a dreamlike or mythic texture.'],
  ['Fantasy', 'spiritual', 'tone_texture', 'fallback', 0.42, 'Fantasy genre can carry spiritual or symbolic stakes.'],
  ['Music', 'music_world', 'setting', 'fallback', 0.7, 'Music genre suggests a music-world setting.'],
  ['Musical', 'music_world', 'setting', 'fallback', 0.7, 'Musical genre suggests a music-world setting.'],
  ['Sport', 'sports_world', 'setting', 'fallback', 0.7, 'Sport genre suggests a sports-world setting.'],
  ['Sport', 'sports_competition', 'story_situation', 'fallback', 0.68, 'Sport genre suggests competition.'],
];

const makeTag = ({ tag, tag_type, importance = 'secondary', confidence = 0.7, source = 'plot_rules', reason = '' }) => ({
  tag,
  tag_type,
  importance,
  confidence: Number(Math.max(0.1, Math.min(0.99, confidence)).toFixed(2)),
  source,
  reason,
  tagger_version: TAGGER_VERSION,
});

const moviePlotText = (movie = {}) => [
  movie.plot,
  movie.Plot,
  movie.description,
  movie.Description,
  movie.overview,
  movie.Overview,
  movie.omdbPlot,
  movie.omdb_plot,
  movie.summary,
].filter(Boolean).join(' ');

const hasStrongPlot = (text) => normalizeText(text).split(/\s+/).filter(Boolean).length >= 12;

export const inferCinematicLifeTags = (movie = {}) => {
  const plot = moviePlotText(movie);
  const text = normalizeText(plot);
  const genres = String(movie?.genres || movie?.genre || '').toLowerCase();
  const byTag = new Map();

  const add = (tag) => {
    const allowed = TAXONOMY[tag.tag_type] || [];
    if (tag.tag_type !== 'plot_keyword' && !allowed.includes(tag.tag)) return;
    const existing = byTag.get(`${tag.tag_type}:${tag.tag}`);
    if (!existing || IMPORTANCE_WEIGHT[tag.importance] > IMPORTANCE_WEIGHT[existing.importance] || tag.confidence > existing.confidence) {
      byTag.set(`${tag.tag_type}:${tag.tag}`, makeTag(tag));
    }
  };

  RULES.forEach(([tag, tag_type, phrases]) => {
    if (!text || !hasAny(text, phrases)) return;
    const exactPhrase = phrases.find((phrase) => text.includes(normalizeText(phrase))) || phrases[0];
    const specific = exactPhrase.split(/\s+/).length >= 2;
    add({
      tag,
      tag_type,
      importance: specific && tag_type !== 'emotional_moral_theme' ? 'primary' : 'secondary',
      confidence: specific ? 0.84 : 0.72,
      reason: `Plot mentions ${exactPhrase}.`,
    });
  });

  if (hasAny(text, ['teenage girls', 'teen girls', 'two girls']) && hasAny(text, ['travel', 'journey', 'go to', 'seek help'])) {
    add({ tag: 'female_friendship', tag_type: 'social_world', importance: 'primary', confidence: 0.82, reason: 'Young women travel together for support.' });
  }
  if (hasAny(text, ['pregnancy', 'abortion', 'clinic', 'medical help']) && hasAny(text, ['denied', 'legal restriction', 'travel', 'another city', 'system'])) {
    add({ tag: 'institutional_barriers', tag_type: 'social_context', importance: 'secondary', confidence: 0.68, reason: 'Care or access appears shaped by systems or institutions.' });
  }
  if (hasAny(text, ['ordinary life', 'everyday', 'rural', 'working class', 'medical help', 'family conflict'])) {
    add({ tag: 'realist', tag_type: 'tone_texture', importance: 'secondary', confidence: 0.68, reason: 'Plot describes a grounded real-world situation.' });
  }
  if (byTag.has('setting:high_school')) {
    add({ tag: 'adolescence', tag_type: 'life_stage', importance: 'secondary', confidence: 0.7, reason: 'High-school setting supports adolescence as a life-stage context.' });
    add({ tag: 'teenage_life', tag_type: 'life_stage', importance: 'secondary', confidence: 0.68, reason: 'High-school setting supports teenage-life context.' });
  }
  if (byTag.has('setting:college_campus')) {
    add({ tag: 'early_adulthood', tag_type: 'life_stage', importance: 'secondary', confidence: 0.58, reason: 'College setting supports early-adulthood context.' });
  }
  if (byTag.has('setting:countryside') || byTag.has('setting:village')) {
    add({ tag: 'traditional_society', tag_type: 'social_context', importance: 'fallback', confidence: 0.46, source: 'context_fallback', reason: 'Rural or village setting can support traditional social-world context.' });
  }
  if (byTag.has('setting:courtroom') || byTag.has('setting:police_station') || byTag.has('story_situation:murder_investigation')) {
    add({ tag: 'trial_or_investigation', tag_type: 'story_situation', importance: 'secondary', confidence: 0.62, reason: 'Legal or police context supports an investigation pattern.' });
    add({ tag: 'justice', tag_type: 'emotional_moral_theme', importance: 'secondary', confidence: 0.58, reason: 'Legal or investigative context supports justice as a moral theme.' });
  }
  if (byTag.has('social_world:marriage') || byTag.has('social_world:mother_child') || byTag.has('social_world:father_child') || byTag.has('social_world:siblings')) {
    add({ tag: 'domestic_life', tag_type: 'social_world', importance: 'secondary', confidence: 0.56, reason: 'Family relationship tags support domestic-life context.' });
  }
  if (byTag.has('social_context:poverty') && (byTag.has('setting:countryside') || byTag.has('setting:village'))) {
    add({ tag: 'rural_poverty', tag_type: 'social_context', importance: 'secondary', confidence: 0.62, reason: 'Poverty in a rural or village context supports rural poverty.' });
  }
  if (byTag.has('setting:new_york_city')) {
    byTag.delete('setting:big_city');
  }

  GENRE_FALLBACKS.forEach(([genre, tag, tag_type, importance, confidence, reason]) => {
    if (genres.includes(String(genre).toLowerCase())) add({ tag, tag_type, importance, confidence, source: 'genre_fallback', reason });
  });

  if (hasAny(text, ['rape', 'raped', 'sexual assault', 'murdered', 'murder'])) {
    byTag.delete('tone_texture:playful');
    byTag.delete('tone_texture:warm');
  }

  extractPlotKeywordTags(plot).forEach((keyword) => {
    add({
      tag: keyword.tag,
      tag_type: 'plot_keyword',
      importance: 'secondary',
      confidence: keyword.confidence,
      source: 'plot_keyword',
      reason: keyword.reason,
    });
  });

  if (!hasStrongPlot(plot)) {
    add({ tag: 'realist', tag_type: 'tone_texture', importance: 'fallback', confidence: 0.45, source: 'genre_fallback', reason: 'Plot data is missing or short, so this tag is a weak fallback.' });
  }

  const tags = Array.from(byTag.values())
    .sort((a, b) =>
      IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance] ||
      b.confidence - a.confidence ||
      a.tag.localeCompare(b.tag)
    );
  const primaryCount = tags.filter((tag) => tag.importance === 'primary').length;
  let promoted = 0;
  const normalized = tags.map((tag, index) => {
    let importance = tag.importance;
    if (importance === 'primary') {
      promoted += 1;
      if (promoted > 4) importance = 'secondary';
    } else if (index < 4 && primaryCount < 2 && importance !== 'fallback') {
      importance = 'primary';
    }
    return { ...tag, importance };
  });
  return normalized.slice(0, Math.max(4, Math.min(36, normalized.length)));
};

export const withCachedCinematicLifeTags = (movie = {}) => {
  const existing = Array.isArray(movie?.cinematicLifeTags) ? movie.cinematicLifeTags : [];
  if (existing.some((tag) => tag?.tagger_version === TAGGER_VERSION)) return movie;
  return { ...movie, cinematicLifeTags: inferCinematicLifeTags(movie) };
};

export const ensureCinematicLifeTagsForMovies = (movies = []) => (
  Array.isArray(movies) ? movies.map((movie) => withCachedCinematicLifeTags(movie)) : []
);

const filmKey = (movie = {}) => {
  const imdbId = String(movie?.imdbId || movie?.imdbID || movie?.const || '').trim();
  if (imdbId) return `imdb:${imdbId}`;
  return `title:${String(movie?.title || '').trim().toLowerCase()}|${Number(movie?.year) || ''}`;
};

export const getUserTagAffinity = (userRatings = [], movieTags = null) => {
  const rows = Array.isArray(userRatings) ? userRatings.filter((movie) => Number(movie?.yourRating || movie?.rating) > 0) : [];
  const overallAverage = rows.length
    ? rows.reduce((sum, movie) => sum + (Number(movie?.yourRating || movie?.rating) || 0), 0) / rows.length
    : 0;
  const externalTags = movieTags instanceof Map ? movieTags : null;
  const grouped = new Map();

  rows.forEach((movie) => {
    const seenMovieTags = new Set();
    const tags = (externalTags?.get(filmKey(movie)) || movie?.cinematicLifeTags || [])
      .filter((tag) => {
        if (!tag?.tag || !tag?.tag_type) return false;
        const key = `${tag.tag_type}:${tag.tag}`;
        if (seenMovieTags.has(key)) return false;
        seenMovieTags.add(key);
        return true;
      });
    tags.forEach((tag) => {
      const rating = Number(movie?.yourRating || movie?.rating) || 0;
      const key = `${tag.tag_type}:${tag.tag}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          tag: tag.tag,
          tag_type: tag.tag_type,
          count: 0,
          weightedRatingSum: 0,
          weightSum: 0,
          highCount: 0,
          confidenceSum: 0,
          primaryCount: 0,
          films: [],
          reasons: new Set(),
        });
      }
      const bucket = grouped.get(key);
      const weight = IMPORTANCE_WEIGHT[tag.importance] || 0.5;
      bucket.count += 1;
      bucket.weightedRatingSum += rating * weight;
      bucket.weightSum += weight;
      bucket.highCount += rating >= overallAverage + 0.75 ? 1 : 0;
      bucket.confidenceSum += Number(tag.confidence) || 0.7;
      bucket.primaryCount += tag.importance === 'primary' ? 1 : 0;
      if (bucket.films.length < 6) {
        bucket.films.push({
          title: movie?.title || 'Unknown Title',
          year: movie?.year || '',
          rating,
          importance: tag.importance,
        });
      }
      if (tag.reason) bucket.reasons.add(tag.reason);
    });
  });

  return Array.from(grouped.values())
    .map((item) => {
      const averageRating = item.weightSum ? item.weightedRatingSum / item.weightSum : 0;
      const tagLift = averageRating - overallAverage;
      const highRatingShare = item.count ? item.highCount / item.count : 0;
      const confidence = item.count ? item.confidenceSum / item.count : 0;
      const primaryTagShare = item.count ? item.primaryCount / item.count : 0;
      const tagAffinityScore = (
        normalize(tagLift, -1.5, 1.5) * 0.45 +
        normalize(item.count, 3, 20) * 0.20 +
        highRatingShare * 100 * 0.20 +
        confidence * 100 * 0.10 +
        primaryTagShare * 100 * 0.05
      );
      return {
        ...item,
        label: compact(item.tag),
        averageRating: Number(averageRating.toFixed(2)),
        userOverallAverage: Number(overallAverage.toFixed(2)),
        lift: Number(tagLift.toFixed(2)),
        highRatingShare: Number(highRatingShare.toFixed(2)),
        confidence: Number(confidence.toFixed(2)),
        primaryTagShare: Number(primaryTagShare.toFixed(2)),
        tagAffinityScore: Math.round(tagAffinityScore),
        reasons: Array.from(item.reasons).slice(0, 3),
        films: item.films.sort((a, b) => b.rating - a.rating).slice(0, 4),
      };
    })
    .filter((item) => item.count >= 3 || (item.count === 2 && item.films.every((film) => film.rating >= overallAverage + 1)))
    .sort((a, b) => b.tagAffinityScore - a.tagAffinityScore || b.lift - a.lift);
};

const sentenceForTags = (items = [], fallback) => {
  const labels = items.slice(0, 3).map((item) => item.label);
  if (!labels.length) return fallback;
  return `Your ratings rise around ${labels.join(', ')} stories.`;
};

export const getCinematicLifeTagReading = (movies = []) => {
  const taggedMovies = Array.isArray(movies) ? movies : [];
  const affinities = getUserTagAffinity(taggedMovies);
  const byTypes = (types) => affinities.filter((item) => types.includes(item.tag_type)).slice(0, 5);
  const recurring = affinities.slice(0, 8);
  const worlds = byTypes(['setting']);
  const social = byTypes(['social_world', 'story_situation', 'social_context']);
  const lifeStages = byTypes(['life_stage']);
  const textures = byTypes(['tone_texture', 'emotional_moral_theme']);
  const lowLift = affinities.filter((item) => item.lift <= 0.1).sort((a, b) => a.lift - b.lift).slice(0, 4);

  return {
    taggedMovies,
    affinities,
    recurring,
    sections: [
      {
        key: 'worlds',
        title: TYPE_LABELS.setting,
        items: worlds,
        summary: sentenceForTags(worlds, 'More plot-tagged films will reveal which settings your ratings consistently reward.'),
      },
      {
        key: 'social',
        title: TYPE_LABELS.social_world,
        items: social,
        summary: sentenceForTags(social, 'More tagged films will reveal the social situations your ratings consistently reward.'),
      },
      {
        key: 'lifeStages',
        title: TYPE_LABELS.life_stage,
        items: lifeStages,
        summary: sentenceForTags(lifeStages, 'More tagged films will reveal which life stages pull you in most.'),
      },
      {
        key: 'textures',
        title: TYPE_LABELS.tone_texture,
        items: textures,
        summary: sentenceForTags(textures, 'More tagged films will reveal the emotional textures your ratings respond to.'),
      },
    ],
    lowLift,
  };
};

export { TAGGER_VERSION, TAXONOMY };
