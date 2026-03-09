/*  Get user input on whether user wants to let their location be accessed.  */
let GivenData = [];

async function Find() {
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject)
    );
    return [pos.coords.latitude, pos.coords.longitude];
  } catch (err) {
    console.error("Error getting location:", err);
    return null; 
  }
}

async function APIcall(question, retryCount = 0, maxRetries = 3) {
  const models = [
    'Qwen/Qwen2.5-32B-Instruct',       // Primary
    'Qwen/Qwen2.5-7B-Instruct'         // Fallback
  ];
  
  const currentModel = models[Math.min(retryCount, models.length - 1)];
  
  try {
    const response = await fetch('https://api.featherless.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer rc_f1cfe1eab5a7595f51c586e03883df18b0667d38314a198f860d3eaf6a6fd4ab'
      },
      body: JSON.stringify({
        model: currentModel,
        temperature: 0.2,  // Lower temperature for more consistent output
        max_tokens: 256,   // Limit response length
        messages: [
          { 
            role: 'system', 
            content: 'You are a location search interpreter. You understand complex natural language descriptions and convert them to single search keywords. Be precise, concise, and practical. Return ONLY the search term, nothing else.' 
          },
          { role: 'user', content: question }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response structure');
    }
    
    const content = data.choices[0].message.content;
    GivenData = content;
    return content;
    
  } catch (err) {
    // Retry with next model if available
    if (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      return APIcall(question, retryCount + 1, maxRetries);
    } else {
      throw err;
    }
  }
}

// Generate 50 OSM-compatible prompt variations (optimized - uses fallback directly)
async function generatePromptVariations(originalPrompt) {
  return generateFallbackVariations(originalPrompt, 30); // Increased from 20 to 30 for better coverage
}

// Generate synthetic variation for fallback
function generateSyntheticVariation(prompt, index) {
  const prefixes = ['Find', 'Locate', 'Search for', 'Get', 'Help with', 'Need', 'Looking for', 'Find me', 'Show me', 'I need'];
  const suffixes = ['nearby', 'close to me', 'in my area', 'around here', 'in my neighborhood', 'not far away', 'within reach'];
  const prefix = prefixes[index % prefixes.length];
  const suffix = suffixes[index % suffixes.length];
  return `${prefix} ${prompt} ${suffix}`;
}

// Fallback variation generation
function generateFallbackVariations(prompt, limitTo = 30) {
  const variations = [prompt];
  const words = prompt.toLowerCase().split(/\s+/);
  const synonymMap = {
    'help': ['assistance', 'support', 'aid', 'guidance', 'resources', 'advice'],
    'medical': ['health', 'doctor', 'clinic', 'hospital', 'healthcare', 'physician', 'urgent care'],
    'food': ['eat', 'restaurant', 'dining', 'meal', 'sustenance', 'provisions', 'kitchen', 'pantry', 'food bank'],
    'shelter': ['housing', 'safe', 'refuge', 'accommodation', 'place to stay', 'emergency housing', 'lodging'],
    'lawyer': ['legal', 'attorney', 'counsel', 'law', 'legal aid', 'solicitor'],
    'police': ['law', 'enforcement', 'officer', 'authorities', 'security', 'law enforcement'],
    'job': ['work', 'employment', 'position', 'career', 'opportunity', 'workforce'],
    'eviction': ['evict', 'housing', 'lease', 'tenant', 'rent', 'landlord'],
    'mental': ['counseling', 'therapy', 'psychology', 'psychiatric', 'mental health services'],
    'childcare': ['daycare', 'preschool', 'nursery', 'children care', 'kids'],
    'transportation': ['bus', 'transit', 'ride', 'taxi', 'uber'],
    'utility': ['power', 'electric', 'water', 'gas', 'heat'],
    'clothing': ['clothes', 'apparel', 'wear', 'donation'],
    'immigration': ['visa', 'asylum', 'citizenship', 'naturalization']
  };
  
  const prefixes = ['Find', 'Locate', 'Search for', 'Get', 'Help with', 'Need', 'Looking for', 'Find nearby'];
  const suffixes = ['nearby', 'in my area', 'close to me', 'around here', 'not far away', 'in your area'];
  const services = ['services', 'assistance', 'support', 'center', 'office', 'help'];
  
  // Generate multiple variations per iteration for speed (5-6 strategies per loop iteration)
  for (let i = 0; i < Math.ceil((limitTo - 1) / 5); i++) {
    // Strategy 1: Synonym replacement
    const wordIndex = i % words.length;
    const word = words[wordIndex].toLowerCase();
    if (synonymMap[word]) {
      const synonym = synonymMap[word][i % synonymMap[word].length];
      const var1 = prompt.replace(new RegExp(`\\b${word}\\b`, 'i'), synonym);
      if (!variations.includes(var1)) variations.push(var1);
    }
    
    // Strategy 2: Prefix variation
    const prefix = prefixes[i % prefixes.length];
    const var2 = `${prefix} ${prompt}`;
    if (!variations.includes(var2)) variations.push(var2);
    
    // Strategy 3: Suffix variation
    const suffix = suffixes[i % suffixes.length];
    const var3 = `${prompt} ${suffix}`;
    if (!variations.includes(var3)) variations.push(var3);
    
    // Strategy 4: Word reordering with services suffix
    if (words.length > 1) {
      const service = services[i % services.length];
      const rest = words.slice(1).join(' ');
      const var4 = rest ? `${rest} ${service}` : `${prompt} ${service}`;
      if (!variations.includes(var4)) variations.push(var4);
    }
    
    // Strategy 5: Prefix + suffix combo (every other iteration)
    if (i % 2 === 0) {
      const comboPrefix = prefixes[(i + 1) % prefixes.length];
      const comboSuffix = suffixes[(i + 1) % suffixes.length];
      const var5 = `${comboPrefix} ${prompt} ${comboSuffix}`;
      if (!variations.includes(var5)) variations.push(var5);
    }
  }
  
  // Trim to exact limitTo and remove duplicates
  const uniqueVariations = [...new Set(variations)];
  return uniqueVariations.slice(0, limitTo);
}

// Main function: search for nearby places by trying 50 prompt variations at fixed 30-mile radius
async function searchNearbyByPrompt(prompt, onProgress = null) {
  try {
    // Get user location
    const coords = await Find();
    if (!coords) {
      console.error("Could not get user location");
      return null;
    }
    
    // Notify progress: generating variations
    if (onProgress) onProgress({
      stage: 'generating',
      message: '🔄 Generating search variations',
      progress: 10
    });
    
    // Generate 50 OSM-compatible prompt variations
    const variations = await generatePromptVariations(prompt);
    
    // Notify progress: starting search
    if (onProgress) onProgress({
      stage: 'searching',
      message: '🔍 Searching 50 variations',
      progress: 20
    });
    
    // Try each variation at fixed 30-mile radius
    for (let i = 0; i < variations.length; i++) {
      const variation = variations[i];
      
      // Update progress every 5 attempts
      if (i % 5 === 0 && onProgress) {
        const progress = Math.min(20 + (i / variations.length) * 60, 90);
        onProgress({
          stage: 'searching',
          message: `🔍 Searching variation ${i + 1}/50`,
          progress: Math.round(progress),
          currentVariation: variation
        });
      }
      
      try {
        const searchType = await determineSearchType(variation);
        const places = await searchOpenStreetMapFixed30(searchType, coords[0], coords[1]);
        
        if (places && places.length > 0) {
          // Notify progress: found results
          if (onProgress) onProgress({
            stage: 'found',
            message: `✅ Found ${places.length} location(s)!`,
            progress: 95,
            resultCount: places.length
          });
          console.log(`✅ Found ${places.length} result(s) using variation: "${variation}"`);
          return places;
        }
      } catch (err) {
        // Silent fail, try next variation
        continue;
      }
    }
    
    // Notify progress: no results
    if (onProgress) onProgress({
      stage: 'no-results',
      message: '❌ No results found nearby',
      progress: 100
    });
    
    console.warn(`❌ No results found in any of 50 variations`);
    return null;
    
  } catch (err) {
    console.error("Error searching nearby:", err);
    return null;
  }
}

// Comprehensive OSM term mappings based on empirical testing
// Ordered by likelihood of finding results
const OSM_TERM_MAPPINGS = {
  // Food & Nutrition
  'food': ['amenity=food_bank', 'amenity=restaurant', 'amenity=cafe', 'amenity=fast_food', 'shop=bakery', 'amenity=social_facility'],
  'restaurant': ['amenity=restaurant', 'amenity=cafe', 'amenity=fast_food'],
  'cafe': ['amenity=cafe', 'amenity=restaurant'],
  'bakery': ['shop=bakery', 'amenity=bakery'],
  'food_bank': ['amenity=food_bank', 'amenity=social_facility'],
  
  // Medical & Health
  'medical': ['amenity=clinic', 'amenity=doctors', 'amenity=hospital', 'shop=pharmacy'],
  'clinic': ['amenity=clinic', 'amenity=doctors', 'amenity=hospital'],
  'hospital': ['amenity=hospital', 'amenity=clinic', 'amenity=doctors'],
  'doctor': ['amenity=doctors', 'amenity=clinic', 'amenity=hospital'],
  'pharmacy': ['shop=pharmacy', 'amenity=pharmacy', 'amenity=clinic'],
  'dental': ['amenity=dentist', 'amenity=clinic', 'amenity=doctors'],
  'dentist': ['amenity=dentist', 'amenity=clinic'],
  'health': ['amenity=hospital', 'amenity=clinic', 'amenity=doctors', 'amenity=health_centre'],
  
  // Shelter & Housing
  'shelter': ['amenity=shelter', 'amenity=social_facility', 'amenity=hostel', 'tourism=hostel'],
  'hostel': ['amenity=hostel', 'tourism=hostel', 'amenity=shelter'],
  'emergency_shelter': ['amenity=shelter', 'amenity=social_facility'],
  'housing': ['amenity=shelter', 'amenity=social_facility', 'amenity=hostel'],
  
  // Legal & Rights
  'legal': ['amenity=lawyer', 'amenity=social_facility', 'office=lawyer'],
  'lawyer': ['amenity=lawyer', 'office=lawyer', 'amenity=social_facility'],
  'eviction': ['amenity=lawyer', 'amenity=social_facility', 'office=government'],
  'attorney': ['amenity=lawyer', 'office=lawyer'],
  'law': ['amenity=lawyer', 'office=law'],
  'tenant': ['amenity=lawyer', 'amenity=social_facility'],
  
  // Mental Health & Counseling
  'counseling': ['amenity=social_facility', 'amenity=clinic', 'amenity=doctors'],
  'mental': ['amenity=social_facility', 'amenity=clinic', 'amenity=doctors'],
  'therapy': ['amenity=social_facility', 'amenity=clinic'],
  'psychologist': ['amenity=social_facility', 'amenity=clinic'],
  'addiction': ['amenity=social_facility', 'amenity=clinic', 'amenity=hospital'],
  'substance': ['amenity=social_facility', 'amenity=clinic'],
  'counselor': ['amenity=social_facility', 'amenity=clinic'],
  
  // Employment & Job Training
  'job': ['office=employment_agency', 'amenity=office', 'office=yes'],
  'jobcenter': ['office=employment_agency', 'amenity=office'],
  'employment': ['office=employment_agency', 'amenity=office'],
  'career': ['office=employment_agency', 'amenity=office'],
  'training': ['amenity=social_facility', 'office=employment_agency', 'amenity=office'],
  'workforce': ['office=employment_agency', 'amenity=office'],
  
  // Childcare & Family Services
  'childcare': ['amenity=kindergarten', 'amenity=childcare', 'amenity=school'],
  'daycare': ['amenity=kindergarten', 'amenity=childcare'],
  'preschool': ['amenity=kindergarten', 'amenity=childcare'],
  'nursery': ['amenity=kindergarten', 'amenity=childcare'],
  'school': ['amenity=school', 'amenity=kindergarten'],
  'children': ['amenity=kindergarten', 'amenity=childcare', 'amenity=social_facility'],
  
  // Financial Assistance & Banking
  'bank': ['amenity=bank', 'amenity=atm', 'amenity=social_facility'],
  'atm': ['amenity=atm', 'amenity=bank'],
  'financial': ['amenity=bank', 'amenity=social_facility'],
  'credit': ['amenity=bank', 'amenity=postoffice'],
  'money': ['amenity=bank', 'amenity=social_facility'],
  'assistance': ['amenity=social_facility', 'office=government'],
  
  // Transportation
  'transportation': ['amenity=taxi', 'amenity=bus_station', 'public_transport=station'],
  'bus': ['amenity=bus_station', 'amenity=taxi'],
  'transit': ['amenity=bus_station', 'public_transport=station'],
  'taxi': ['amenity=taxi', 'amenity=bus_station'],
  'public_transport': ['amenity=bus_station', 'public_transport=station'],
  
  // Utilities & Government Services
  'utility': ['office=utility', 'amenity=office', 'office=government'],
  'utilities': ['office=utility', 'amenity=office'],
  'government': ['office=government', 'amenity=office'],
  'office': ['amenity=office', 'office=yes'],
  
  // Community Services
  'social_facility': ['amenity=social_facility', 'office=social_services', 'office=government'],
  'social': ['amenity=social_facility', 'office=social_services'],
  'community': ['amenity=social_facility', 'office=social_services', 'amenity=community_centre'],
  'services': ['amenity=social_facility', 'office=government'],
  'nonprofit': ['amenity=social_facility', 'office=social_services'],
  'charity': ['amenity=social_facility', 'office=social_services'],
  
  // Immigration & Language Services
  'immigration': ['amenity=social_facility', 'office=government', 'office=legal'],
  'visa': ['amenity=social_facility', 'office=legal'],
  'asylum': ['amenity=social_facility', 'office=legal'],
  'refugee': ['amenity=social_facility', 'office=government'],
  'translator': ['amenity=social_facility'],
  
  // Other Services
  'library': ['amenity=library', 'amenity=community_centre'],
  'police': ['amenity=police', 'office=government'],
  'postoffice': ['amenity=postoffice', 'amenity=office'],
  'nonprofit_housing': ['amenity=social_facility', 'amenity=shelter'],
  'disability': ['amenity=social_facility', 'office=government'],
  'veteran': ['amenity=social_facility', 'office=government'],
  'domestic_violence': ['amenity=shelter', 'amenity=social_facility'],
  'violence': ['amenity=shelter', 'amenity=social_facility'],
  'abuse': ['amenity=shelter', 'amenity=social_facility', 'amenity=clinic']
};

// Quick search with term switching - tries OSM mappings first, then variations
async function searchNearbyByPromptStreaming(prompt, onProgress = null, onNewPlace = null) {
  try {
    // Get user location
    const coords = await Find();
    if (!coords) {
      console.error("Could not get user location");
      return null;
    }
    
    // Notify progress: starting search
    if (onProgress) onProgress({
      stage: 'searching',
      message: '🔍 Searching nearby',
      progress: 20
    });
    
    let allPlaces = [];
    
    // Step 1: Try to determine best OSM term from prompt
    let searchType = await determineSearchType(prompt);
    searchType = searchType.toLowerCase().trim();
    
    // Add common term mappings for compound terms from AI suggestions
    const compoundTermMappings = {
      'evictionlegalaid': 'legal',
      'free_clinic': 'clinic',
      'emergency_shelter': 'shelter',
      'jobcenter': 'job',
      'utility_company': 'utility',
      'social_services': 'social_facility',
      'food_assistance': 'food',
      'legal_aid': 'legal'
    };
    
    // Map compound terms to our OSM categories
    if (compoundTermMappings[searchType]) {
      searchType = compoundTermMappings[searchType];
    }
    
    // Step 2: Try the OSM mappings for this search type first (fast track)
    const osmMappings = OSM_TERM_MAPPINGS[searchType] || [];
    
    if (osmMappings.length > 0) {
      for (const osmTerm of osmMappings) {
        if (onProgress) {
          onProgress({
            stage: 'searching',
            message: `🔍 Searching for "${searchType}"...`,
            progress: 30
          });
        }
        
        // Fast check: 100ms delay for known-good terms
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          const places = await searchOpenStreetMapFixed30(osmTerm, coords[0], coords[1]);
          
          if (places && places.length > 0) {
            const uniquePlaces = places.filter(place => {
              const isDuplicate = allPlaces.some(p => 
                p.name === place.name && 
                Math.abs(p.lat - place.lat) < 0.0001 && 
                Math.abs(p.lon - place.lon) < 0.0001
              );
              return !isDuplicate;
            });
            
            uniquePlaces.forEach(place => {
              if (onNewPlace) onNewPlace(place);
            });
            allPlaces = [...allPlaces, ...uniquePlaces];
            
            // Return immediately on success
            return allPlaces;
          }
        } catch (err) {
          // Try next OSM mapping
          continue;
        }
      }
    }
    
    // Step 3: If exact type mapping found nothing, try related categories
    if (allPlaces.length === 0) {
      const relatedness = {
        'legal': ['social_facility', 'office', 'government'],
        'medical': ['clinic', 'hospital', 'pharmacy'],
        'food': ['restaurant', 'cafe', 'social_facility'],
        'shelter': ['social_facility', 'hostel'],
        'job': ['office', 'employment'],
        'counseling': ['social_facility', 'clinic'],
        'mental': ['counseling', 'social_facility'],
        'childcare': ['school', 'social_facility'],
        'transportation': ['bus', 'taxi'],
        'utility': ['government', 'office'],
        'financial': ['bank', 'social_facility'],
        'addiction': ['social_facility', 'clinic', 'medical']
      };
      
      const relatedCategories = relatedness[searchType] || [];
      
      for (const relatedType of relatedCategories) {
        const relatedMappings = OSM_TERM_MAPPINGS[relatedType] || [];
        
        for (const osmTerm of relatedMappings.slice(0, 2)) {  // Try only best 2 for each related type
          if (onProgress) {
            onProgress({
              stage: 'searching',
              message: `🔍 Trying related "${relatedType}"...`,
              progress: 40
            });
          }
          
          await new Promise(resolve => setTimeout(resolve, 150));
          
          try {
            const places = await searchOpenStreetMapFixed30(osmTerm, coords[0], coords[1]);
            
            if (places && places.length > 0) {
              const uniquePlaces = places.filter(place => {
                const isDuplicate = allPlaces.some(p => 
                  p.name === place.name && 
                  Math.abs(p.lat - place.lat) < 0.0001 && 
                  Math.abs(p.lon - place.lon) < 0.0001
                );
                return !isDuplicate;
              });
              
              uniquePlaces.forEach(place => {
                if (onNewPlace) onNewPlace(place);
              });
              allPlaces = [...allPlaces, ...uniquePlaces];
              
              return allPlaces;
            }
          } catch (err) {
            continue;
          }
        }
      }
    }
    
    // Step 3: If OSM mappings found nothing, try 30 variations quickly
    if (onProgress) onProgress({
      stage: 'searching',
      message: '🔄 Trying alternative terms...',
      progress: 40
    });
    
    const variations = await generatePromptVariations(prompt);
    
    for (let i = 0; i < variations.length; i++) {
      const variation = variations[i];
      
      try {
        const varSearchType = await determineSearchType(variation);
        
        // Update progress every 2 attempts
        if (i % 2 === 0 && onProgress) {
          const progress = Math.min(40 + (i / variations.length) * 50, 90);
          const searchPreview = varSearchType.length > 20 ? varSearchType.substring(0, 20) + '...' : varSearchType;
          onProgress({
            stage: 'searching',
            message: `🔍 Testing "${searchPreview}"...`,
            progress: Math.round(progress)
          });
        }
        
        // 200ms delay for variation testing (faster than before)
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const places = await searchOpenStreetMapFixed30(varSearchType, coords[0], coords[1]);
        
        if (places && places.length > 0) {
          const uniquePlaces = places.filter(place => {
            const isDuplicate = allPlaces.some(p => 
              p.name === place.name && 
              Math.abs(p.lat - place.lat) < 0.0001 && 
              Math.abs(p.lon - place.lon) < 0.0001
            );
            return !isDuplicate;
          });
          
          uniquePlaces.forEach(place => {
            if (onNewPlace) onNewPlace(place);
          });
          allPlaces = [...allPlaces, ...uniquePlaces];
          
          // Return immediately on success
          return allPlaces;
        }
      } catch (err) {
        // Try next variation
        continue;
      }
    }
    
    // Return whatever was found (even if empty)
    return allPlaces.length > 0 ? allPlaces : null;
    
  } catch (err) {
    console.error("Error searching nearby:", err);
    return null;
  }
}

// Use AI to understand what type of place the user is looking for
async function determineSearchType(prompt) {
  const p = prompt.toLowerCase();
  
  // Direct pattern matching for common phrases - faster than API
  const patterns = {
    food: /food|hungry|eat|meal|hunger|restaurants?|cafe|bakery|provisions/i,
    medical: /medical|health|doctor|clinic|hospital|medicine|care|sick|illness/i,
    shelter: /shelter|housing|homeless|home|roof|displaced|emergency|night/i,
    legal: /legal|lawyer|attorney|evict|tenant|rights|court|law|lease/i,
    job: /job|work|employ|career|training|workforce|position|hire/i,
    mental: /mental|counseling|therapy|psycholog|depression|anxiety|addict|substance|abuse|trauma/i,
    childcare: /childcare|daycare|preschool|nursery|children|kids|school/i,
    financial: /financial|money|utility|bills|assist|poor|poverty|income|assistance/i,
    transportation: /transportation|bus|taxi|transit|ride|travel|move/i,
    police: /police|officer|law enforce|security|crime|safe|dangerous/i,
    pharmacy: /pharmacy|medicine|drug|prescription|medication/i,
    immigration: /immigration|visa|asylum|refugee|citizen|undocumented/i,
    disability: /disability|disable|handicap|wheelchair|special|needs/i,
    violence: /violence|abuse|domestic|violent|assault|victim|safe|hurt/i,
    government: /government|agency|office|service|help|resource/i
  };
  
  // Check patterns
  for (const [term, regex] of Object.entries(patterns)) {
    if (regex.test(p)) {
      return term;
    }
  }
  
  // Fallback to API if no pattern matched
  try {
    const response = await APIcall(`Convert to OSM term: "${prompt}". ONLY the term. One word preferred.`, 0, 1);
    
    let tag = response
      .trim()
      .toLowerCase()
      .replace(/["'.]/g, '')
      .replace(/[\s_-]/g, '')  // Remove spaces, underscores, hyphens
      .split(/[,;:\n|]/)[0]
      .trim()
      .split(/\s+/)[0];
    
    if (!tag || tag.length < 2 || tag.length > 30) {
      tag = prompt.toLowerCase().split(/\s+/)[0];
    }
    
    return tag;
    
  } catch (err) {
    return prompt.toLowerCase().split(/\s+/)[0] || 'social_facility';
  }
}

// Search OpenStreetMap at fixed 30-mile radius for single prompt variation
async function searchOpenStreetMapFixed30(searchType, latitude, longitude) {
  const milesPerDegree = 69;
  const fixedRadiusMiles = 30;
  const delta = fixedRadiusMiles / milesPerDegree;
  const maxDistance = fixedRadiusMiles;
  
  try {
    const overpassQuery = buildOverpassQuery(searchType, latitude, longitude, delta);
    
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: overpassQuery,
      headers: { 'Content-Type': 'application/osm3s+xml' }
    });
    
    if (!response.ok) {
      throw new Error(`Overpass returned ${response.status}`);
    }
    
    const responseText = await response.text();
    
    if (!responseText || responseText.length < 10) {
      throw new Error('Empty response');
    }
    
    const places = parseOverpassXML(responseText, latitude, longitude, maxDistance);
    return places.length > 0 ? places : null;
    
  } catch (err) {
    return null;
  }
}

// Build Overpass API query with variable delta
function buildOverpassQuery(searchType, lat, lon, delta) {
  // Map common search terms to OpenStreetMap amenity/shop tags
  const tagMappings = {
    'hospital': 'amenity=hospital',
    'clinic': 'amenity=clinic|clinic:type=general',
    'doctor': 'amenity=doctors|amenity=clinic',
    'physicians': 'amenity=doctors',
    'pharmacy': 'shop=pharmacy|amenity=pharmacy',
    'restaurant': 'amenity=restaurant',
    'food': 'amenity=restaurant|amenity=food_bank|amenity=cafe',
    'food_bank': 'amenity=food_bank|amenity=social_facility',
    'shelter': 'amenity=shelter|amenity=social_facility',
    'legal': 'amenity=lawyer|amenity=social_facility',
    'attorney': 'amenity=lawyer',
    'police': 'amenity=police',
    'library': 'amenity=library',
    'bank': 'amenity=bank',
    'atm': 'amenity=atm',
    'mental': 'amenity=clinic|amenity=doctors',
    'counseling': 'amenity=social_facility|amenity=clinic',
    'therapy': 'amenity=social_facility',
    'childcare': 'amenity=kindergarten|amenity=childcare',
    'daycare': 'amenity=kindergarten|amenity=childcare',
    'transportation': 'amenity=bus_station|amenity=taxi',
    'utility': 'office=utility',
    'office': 'office=yes',
    'government': 'office=government'
  };
  
  // Check if searchType is already an OSM term (contains = sign)
  let tag;
  if (searchType.includes('=')) {
    // Already an OSM term like "amenity=restaurant"
    tag = searchType;
  } else {
    // Lookup mapped term
    tag = tagMappings[searchType];
    if (!tag) {
      tag = `amenity=${searchType}`;
    }
  }
  
  const [key, value] = tag.split('=');
  
  // Calculate bounding box with provided delta
  const south = lat - delta;
  const west = lon - delta;
  const north = lat + delta;
  const east = lon + delta;
  
  // Handle multiple OSM terms separated by pipe (|)
  let queryParts = [];
  const terms = tag.split('|');
  for (const term of terms) {
    const [k, v] = term.split('=');
    queryParts.push(`node["${k}"="${v}"](${south},${west},${north},${east})`);
    queryParts.push(`way["${k}"="${v}"](${south},${west},${north},${east})`);
    queryParts.push(`relation["${k}"="${v}"](${south},${west},${north},${east})`);
  }
  
  // Overpass API query with JSON output - handles multiple terms
  return `[out:json][timeout:60];(${queryParts.join(';')};);out center;`;
}

// Parse Overpass JSON/XML response
function parseOverpassXML(responseText, userLat, userLon, maxDistance) {
  const places = [];
  
  try {
    // Check if we got JSON response
    if (responseText.includes('"type"') || responseText.startsWith('{')) {
      const data = JSON.parse(responseText);
      
      if (data.elements && data.elements.length > 0) {
        data.elements.forEach((element) => {
          if (element.tags && element.tags.name) {
            const elemLat = element.lat || (element.center && element.center.lat);
            const elemLon = element.lon || (element.center && element.center.lon);
            
            if (elemLat && elemLon) {
              const distance = calculateDistance(userLat, userLon, elemLat, elemLon);
              
              if (distance <= maxDistance) {
                places.push({
                  name: element.tags.name,
                  latitude: elemLat,
                  longitude: elemLon,
                  source: 'OpenStreetMap',
                  distance: distance
                });
              }
            }
          }
        });
      }
    } else {
      throw new Error('Not JSON format');
    }
  } catch (jsonErr) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, 'text/xml');
      const nodes = xmlDoc.querySelectorAll('node');
      const ways = xmlDoc.querySelectorAll('way');

      nodes.forEach(node => {
        const nameTag = node.querySelector('tag[k="name"]');
        if (nameTag) {
          const lat = parseFloat(node.getAttribute('lat'));
          const lon = parseFloat(node.getAttribute('lon'));
          const distance = calculateDistance(userLat, userLon, lat, lon);

          if (distance <= maxDistance) {
            places.push({
              name: nameTag.getAttribute('v'),
              latitude: lat,
              longitude: lon,
              source: 'OpenStreetMap',
              distance: distance
            });
          }
        }
      });

      ways.forEach(way => {
        const nameTag = way.querySelector('tag[k="name"]');
        const centerTag = way.querySelector('center');
        if (nameTag && centerTag) {
          const lat = parseFloat(centerTag.getAttribute('lat'));
          const lon = parseFloat(centerTag.getAttribute('lon'));
          const distance = calculateDistance(userLat, userLon, lat, lon);

          if (distance <= maxDistance) {
            places.push({
              name: nameTag.getAttribute('v'),
              latitude: lat,
              longitude: lon,
              source: 'OpenStreetMap',
              distance: distance
            });
          }
        }
      });
    } catch (xmlErr) {
      // Both parsing methods failed silently
    }
  }

  return places.sort((a, b) => a.distance - b.distance).slice(0, 10);
}


// Fallback: Use Nominatim API if Overpass exhausts all radii
async function fallbackNominatimSearch(searchType, latitude, longitude, maxDistance) {
    try {
      // Map search types to readable queries for Nominatim
      const queryMappings = {
        'hospital': 'hospital',
        'clinic': 'clinic',
        'doctor': 'doctor',
        'pharmacy': 'pharmacy',
        'restaurant': 'restaurant',
        'food': 'food',
        'food_bank': 'food bank',
        'shelter': 'shelter',
        'legal': 'legal aid',
        'police': 'police',
        'library': 'library',
        'bank': 'bank',
        'atm': 'ATM'
      };
      
      const query = queryMappings[searchType] || searchType;
      const encodedQuery = encodeURIComponent(query);
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&lat=${latitude}&lon=${longitude}&limit=20&format=json`,
        { headers: { 'User-Agent': 'AidLens-App' } }
      );
      
      if (!response.ok) {
        return [];
      }
      
      const results = await response.json();
      
      if (!results || results.length === 0) {
        return [];
      }
      
      const filtered = results
        .map(place => ({
          name: place.name,
          latitude: parseFloat(place.lat),
          longitude: parseFloat(place.lon),
          source: 'OpenStreetMap (Nominatim)',
          distance: calculateDistance(latitude, longitude, parseFloat(place.lat), parseFloat(place.lon))
        }))
        // Filter by max distance
        .filter(place => place.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);
      
      return filtered;
  } catch (err) {
    return [];
  }
}

// Calculate distance in miles between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ========== DOM AND MAP STATE ==========
let map = null;
let userMarker = null;
let resultMarkers = [];
let userLat = null, userLon = null;
let isTyping = false;
let typingEl = null;

// ========== MAP INITIALIZATION ==========
function initMap() {
  map = L.map('map', { zoomControl: false }).setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  locateUser(true);
}

function locateUser(silent = false) {
  if (!navigator.geolocation) {
    if (!silent) alert('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
      map.setView([userLat, userLon], 13);
      if (userMarker) map.removeLayer(userMarker);
      const pulseIcon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;background:radial-gradient(circle,#ffffff 30%,rgba(255,255,255,0.2) 100%);border-radius:50%;border:3px solid #aaaaaa;box-shadow:0 0 0 6px rgba(255,255,255,0.1);animation:pulse 2s infinite;"></div>
        <style>@keyframes pulse{0%,100%{box-shadow:0 0 0 6px rgba(255,255,255,0.08)}50%{box-shadow:0 0 0 12px rgba(255,255,255,0.04)}}</style>`,
        iconSize: [18, 18], iconAnchor: [9, 9]
      });
      userMarker = L.marker([userLat, userLon], { icon: pulseIcon })
        .addTo(map).bindPopup('<b>📍 You are here</b>').openPopup();
      if (!silent) addAIMessage("📍 Got your location! Now tell me what kind of help you're looking for.");
    },
    () => {
      if (!silent) addAIMessage("I couldn't get your exact location. Could you tell me your city or neighborhood?");
    }
  );
}

// ========== DIRECTIONS UTILITIES ==========
function generateDirectionUrls(placeName, lat, lon) {
  const encoded = encodeURIComponent(`${lat},${lon}`);
  const placeName_encoded = encodeURIComponent(placeName);
  
  return {
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${encoded}&destination_place_id=${placeName_encoded}`,
    appleMaps: `maps://maps.apple.com/?daddr=${lat},${lon}`,
    waze: `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`,
    osmDirections: `https://www.openstreetmap.org/directions?engine=osrm_car&route=${userLat},${userLon};${lat},${lon}`,
    osmLink: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=16`
  };
}

function openDirectionsAlert(placeName, lat, lon) {
  const urls = generateDirectionUrls(placeName, lat, lon);
  
  // Create direction buttons HTML
  const directionsHtml = `
    <div style="display:flex; flex-direction:column; gap:8px; padding:12px 0;">
      <div style="font-weight:600; margin-bottom:4px;">📍 Get Directions to:</div>
      <button onclick="window.open('${urls.googleMaps}', '_blank')" style="padding:10px; background:#4285F4; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:500;">🗺️ Google Maps</button>
      <button onclick="window.open('${urls.waze}', '_blank')" style="padding:10px; background:#00B4FF; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:500;">📍 Waze</button>
      <button onclick="window.open('${urls.osmDirections}', '_blank')" style="padding:10px; background:#239c3b; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:500;">🧭 OpenStreetMap Routes</button>
      <button onclick="window.open('${urls.osmLink}', '_blank')" style="padding:10px; background:#999; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:500;">🌐 Open in Browser</button>
    </div>
  `;
  
  // Show in a custom div popup
  const popup = L.popup({
    maxWidth: 280,
    className: 'directions-popup'
  }).setContent(`
    <div style="font-family:'DM Sans',sans-serif; padding:8px;">
      <div style="font-weight:600; color:#141414; margin-bottom:12px; font-size:0.95rem;">
        📍 ${placeName}
      </div>
      ${directionsHtml}
    </div>
  `);
  
  popup.setLatLng([lat, lon]).openOn(map);
}

// Add CSS for directions popup
const style = document.createElement('style');
style.textContent = `
  .directions-popup .leaflet-popup-close-button {
    color: #333;
    font-size: 20px;
  }
  .directions-popup .leaflet-popup-content-wrapper {
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .directions-popup button:hover {
    opacity: 0.9;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    transition: all 0.2s ease;
  }
`;
document.head.appendChild(style);

// ========== MAP UTILITIES ==========
function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function clearResultMarkers() {
  resultMarkers.forEach(m => map.removeLayer(m));
  resultMarkers = [];
}

function addResultsToMap(places, categoryORprompt) {
  clearResultMarkers();
  const bounds = [];
  if (userLat && userLon) bounds.push([userLat, userLon]);

  // Handle both OSM places (from web.js) and Nominatim places (from Claude)
  const isOSMFormat = places[0]?.name !== undefined;
  
  places.forEach((place, i) => {
    let lat, lon, name, addr;
    
    if (isOSMFormat) {
      // web.js format (name, latitude, longitude, distance)
      lat = place.latitude;
      lon = place.longitude;
      name = place.name;
      addr = `${place.distance.toFixed(1)} miles away`;
    } else {
      // Nominatim format (display_name, lat, lon)
      lat = parseFloat(place.lat);
      lon = parseFloat(place.lon);
      name = place.display_name.split(',')[0];
      addr = place.display_name.split(',').slice(0,3).join(', ');
    }
    
    // RED MARKER COLOR
    const emoji = isOSMFormat ? '📍' : '🏢';
    const redPinHtml = `<div style="background:#EF4444;width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.25);border:2px solid rgba(255,255,255,0.85);"><span style="transform:rotate(45deg);font-size:15px;">${emoji}</span></div>`;
    const icon = L.divIcon({ className:'', html:redPinHtml, iconSize:[36,36], iconAnchor:[18,36], popupAnchor:[0,-38] });
    const dist = (userLat && userLon && isOSMFormat === false) ? distKm(userLat,userLon,lat,lon).toFixed(1)+' km away' : addr;
    
    const marker = L.marker([lat,lon],{icon}).addTo(map).bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;padding:8px 4px;min-width:200px;">
        <div style="font-weight:600;color:#141414;margin-bottom:4px;font-size:0.95rem;">${emoji} ${name}</div>
        <div style="font-size:0.78rem;color:#1c1c1c;">${addr}</div>
        ${dist && dist !== addr ? `<div style="font-size:0.75rem;color:#666;margin-top:4px;font-weight:500;">📍 ${dist}</div>` : ''}
        <button onclick="window.AidLensChat.showDirections('${escAttr(name)}', ${lat}, ${lon})" style="margin-top:10px; width:100%; padding:8px; background:#EF4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:500; font-size:0.85rem;">🧭 Get Directions</button>
      </div>`);
    
    // Add click handler to marker for directions
    marker.on('click', () => {
      openDirectionsAlert(name, lat, lon);
    });
    
    resultMarkers.push(marker);
    bounds.push([lat,lon]);
  });

  if (bounds.length > 1) map.fitBounds(bounds, { padding:[60,60] });
  else if (bounds.length === 1) map.setView(bounds[0], 13);

  updateMapLegend(places.length, categoryORprompt);
}

function updateMapLegend(count, label) {
  document.getElementById('map-legend').classList.add('visible');
  document.getElementById('legend-content').innerHTML = `<span class="legend-count">${count}</span> ${label} locations found`;
}

// ========== CLAUDE AI ==========
async function callAI(userMessage) {
  const systemPrompt = `You are AidLens Guide, an empathetic AI assistant on AidLens — a community resource portal that helps less-fortunate people find free and low-cost services near them.

Your job:
1. Listen with empathy and warmth to the person's situation.
2. Identify what kind of help they need (legal, medical, food, shelter, job, mental health, immigration, domestic violence, financial assistance, etc).
3. Respond helpfully and concisely (2-3 sentences max).
4. At the END of your response, always include search keywords in this format: SEARCH: [keyword1], [keyword2]

Examples of responses:
- "I understand you're struggling. I'm here to help you find resources. SEARCH: food bank, food assistance"
- "That sounds challenging. Let me help you find legal support. SEARCH: tenant rights attorney, eviction help"
- "I'm sorry you're going through this. Here are resources that can help. SEARCH: shelter, emergency housing"

Tone: warm, respectful, non-judgmental. Always include SEARCH keywords at the end.`;

  try {
    const fullResponse = await APIcall(systemPrompt + '\n\nUser: ' + userMessage);
    
    // Parse search terms from the response
    let searchTerms = [];
    let displayText = fullResponse;
    
    // Extract SEARCH: keywords
    const searchMatch = fullResponse.match(/SEARCH:\s*([^\n]+)/i);
    if (searchMatch) {
      const searchString = searchMatch[1];
      searchTerms = searchString.split(',').map(term => term.trim()).filter(t => t);
      // Remove SEARCH: line from display
      displayText = fullResponse.replace(/\s*SEARCH:\s*[^\n]+/i, '').trim();
    }
    
    let searchData = null;
    if (searchTerms.length > 0) {
      searchData = {
        searchTerms: searchTerms,
        category: 'Search Results',
        emoji: '📍',
        needsLocation: true
      };
    }
    
    return { displayText, searchData };
  } catch (err) {
    console.error('Error in AI call:', err);
    return { 
      displayText: 'I\'m having trouble connecting right now. Please try again in a moment.',
      searchData: null
    };
  }
}

// Suggest alternative categories when primary search finds nothing
async function callAIForAlternatives(userMessage) {
  const systemPrompt = `You are AidLens Guide analyzing a user's situation to suggest helpful alternative services.

The user's initial search found no results nearby. Based on their situation, suggest 2-3 COMPLEMENTARY service categories that would also help them (things that address related needs).

Respond ONLY with: CATEGORIES: [category1], [category2], [category3]

Examples:
- User: "I'm being evicted" → CATEGORIES: shelter, financial assistance, counseling
- User: "I have no food" → CATEGORIES: financial assistance, job training, food bank
- User: "I need medical help but have no insurance" → CATEGORIES: clinic, financial assistance, job opportunities
- User: "I'm struggling with addiction" → CATEGORIES: counseling, shelter, medical clinic

Be practical and empathetic. Suggest things that genuinely help their underlying situation.`;

  try {
    const fullResponse = await APIcall(systemPrompt + '\n\nUser: ' + userMessage);
    
    let alternatives = [];
    const catMatch = fullResponse.match(/CATEGORIES:\s*([^\n]+)/i);
    if (catMatch) {
      const catString = catMatch[1];
      alternatives = catString.split(',').map(cat => cat.trim()).filter(c => c);
    }
    
    return alternatives;
  } catch (err) {
    console.error('Error getting alternatives:', err);
    return [];
  }
}

// ========== CHAT INTERFACE ==========
async function searchWithWebJs(prompt) {
  try {
    const places = await searchNearbyByPrompt(prompt);
    return places;
  } catch (err) {
    console.error('Error in web.js search:', err);
    return [];
  }
}

// Search with progress callback
async function searchWithWebJsWithProgress(prompt, onProgress) {
  try {
    const places = await searchNearbyByPrompt(prompt, onProgress);
    return places;
  } catch (err) {
    console.error('Error in web.js search:', err);
    return [];
  }
}

// Search with streaming callback for each found place
async function searchWithWebJsStreaming(prompt, onProgress, onNewPlace) {
  try {
    const places = await searchNearbyByPromptStreaming(prompt, onProgress, onNewPlace);
    return places;
  } catch (err) {
    console.error('Error in web.js search:', err);
    return [];
  }
}

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text || isTyping) return;
  input.value = ''; input.style.height = 'auto';
  addUserMessage(text);
  isTyping = true;
  document.getElementById('send-btn').disabled = true;
  showTyping(); setLoadingBar(true);
  
  let progressMessageId = null;
  let aiMessageId = null;
  let foundPlaces = [];
  
  try {
    const { displayText, searchData } = await callAI(text);
    hideTyping();
    
    if (searchData) {
      // Add initial progress message bubble
      progressMessageId = addProgressMessage('🔍 Finding help for you ');
      
      // Add AI message that will show results as they come in
      aiMessageId = addInitialAIMessage(displayText, searchData.emoji);
      
      for (const searchTerm of (searchData.searchTerms || [])) {
        // Define progress callback
        const onProgress = (update) => {
          updateProgressMessage(progressMessageId, update);
        };
        
        const onNewPlace = (place) => {
          // Add place to found list
          foundPlaces.push(place);
          // Update AI message with current places - show all found so far
          updateAIMessageWithPlaces(aiMessageId, displayText, foundPlaces, searchData.emoji);
        };
        
        const results = await searchWithWebJsStreaming(searchTerm, onProgress, onNewPlace);
        if (results && results.length > 0) {
          foundPlaces = [...foundPlaces, ...results];
          if (foundPlaces.length > 0) break;
        }
      }
      
      // Deduplicate and finalize
      const seen = new Set();
      foundPlaces = foundPlaces.filter(p => { 
        const key = (p.name || p.display_name);
        if (seen.has(key)) return false; 
        seen.add(key); 
        return true; 
      }).slice(0, 10);
      
      // Remove progress bubble
      removeProgressMessage(progressMessageId);
      
      // Replace AI message with final results
      removeAIMessage(aiMessageId);
      
      if (foundPlaces.length > 0) {
        addAIMessage(displayText, foundPlaces, searchData.category, searchData.emoji);
        addResultsToMap(foundPlaces, searchData.category);
      } else {
        // No results found - try one alternative category
        updateProgressMessage(progressMessageId, {
          stage: 'alternatives',
          message: '🔄 Searching for related resources...',
          progress: 95
        });
        
        const alternatives = await callAIForAlternatives(text);
        
        if (alternatives && alternatives.length > 0) {
          // Try searching for just the first alternative category
          const altCategory = alternatives[0];
          
          const onProgress = (update) => {
            updateProgressMessage(progressMessageId, {
              ...update,
              message: `🔍 Searching for "${altCategory}"...`
            });
          };
          
          const onNewPlace = (place) => {
            foundPlaces.push(place);
            updateAIMessageWithPlaces(aiMessageId, displayText, foundPlaces, searchData.emoji);
          };
          
          const results = await searchWithWebJsStreaming(altCategory, onProgress, onNewPlace);
          if (results && results.length > 0) {
            foundPlaces = [...foundPlaces, ...results];
          }
          
          // Deduplicate all results
          const seen = new Set();
          foundPlaces = foundPlaces.filter(p => {
            const key = (p.name || p.display_name);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).slice(0, 10);
          
          // Remove progress bubble
          removeProgressMessage(progressMessageId);
          removeAIMessage(aiMessageId);
          
          if (foundPlaces.length > 0) {
            // Show combined results
            addAIMessage(displayText, foundPlaces, searchData.category, searchData.emoji);
            addResultsToMap(foundPlaces, searchData.category);
          } else {
            addAIMessage(displayText + '\n\n⚠️ I searched nearby but couldn\'t find exact listings. Try enabling your location or searching a larger city nearby. You can also call 211 (US) — a free helpline that connects you with local services.');
          }
        } else {
          // No alternatives could be suggested
          removeProgressMessage(progressMessageId);
          removeAIMessage(aiMessageId);
          addAIMessage(displayText + '\n\n⚠️ I searched nearby but couldn\'t find exact listings. Try enabling your location or searching a larger city nearby. You can also call 211 (US) — a free helpline that connects you with local services.');
        }
      }
    } else {
      addAIMessage(displayText);
    }
  } catch (err) {
    hideTyping();
    if (progressMessageId) removeProgressMessage(progressMessageId);
    if (aiMessageId) removeAIMessage(aiMessageId);
    console.error('Error during search:', err);
    addAIMessage('I\'m having trouble connecting right now. Please try again in a moment. If you need immediate help, call 211 — it\'s free and connects you with local services.');
  }
  isTyping = false;
  document.getElementById('send-btn').disabled = false;
  setLoadingBar(false);
}

function addUserMessage(text) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `<div class="msg-avatar">👤</div><div class="msg-bubble">${escHtml(text)}</div>`;
  msgs.appendChild(div); scrollMessages();
}

function addProgressMessage(text) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = 'progress-msg-' + Date.now();
  div.innerHTML = `<div class="msg-avatar"><img src = "bot pfp.png" height = "30"></img></div><div class="msg-bubble"><strong>AidLens Guide</strong><br/><div class="progress-content">${text}</div><div class="progress-bar-inline"><div class="progress-bar-fill" style="width:0%"></div></div></div>`;
  msgs.appendChild(div); 
  scrollMessages();
  return div.id;
}

function updateProgressMessage(messageId, update) {
  const msgEl = document.getElementById(messageId);
  if (!msgEl) return;
  
  const contentEl = msgEl.querySelector('.progress-content');
  const barEl = msgEl.querySelector('.progress-bar-fill');
  
  if (contentEl) {
    contentEl.innerHTML = update.message || update.stage;
  }
  
  if (barEl && update.progress) {
    barEl.style.width = update.progress + '%';
  }
  
  scrollMessages();
}

function removeProgressMessage(messageId) {
  const msgEl = document.getElementById(messageId);
  if (msgEl) msgEl.remove();
}

function addInitialAIMessage(text, emoji = '📍') {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = 'ai-msg-' + Date.now();
  div.innerHTML = `<div class="msg-avatar"><img src = "bot pfp.png" height = "30"></img></div><div class="msg-bubble"><strong>AidLens Guide</strong><br/>${escHtml(text).replace(/\n/g,'<br/>')}<div id="streaming-results-${div.id}" style="margin-top:12px;"></div></div>`;
  msgs.appendChild(div);
  scrollMessages();
  return div.id;
}

function updateAIMessageWithPlaces(messageId, initialText, places, emoji = '📍') {
  const msgEl = document.getElementById(messageId);
  if (!msgEl) return;
  
  const resultsEl = msgEl.querySelector(`#streaming-results-${messageId}`);
  if (!resultsEl) return;
  
  let cardsHtml = '<div class="result-cards">';
  places.forEach(p => {
    const name = p.name || p.display_name.split(',')[0];
    const addr = p.name ? `${p.distance.toFixed(1)} miles away` : p.display_name.split(',').slice(1,3).join(', ').trim();
    const lat = p.latitude || parseFloat(p.lat);
    const lon = p.longitude || parseFloat(p.lon);
    cardsHtml += `<div class="result-card" onclick="window.AidLensChat.focusPlace(${lat},${lon},'${escAttr(name)}')">
      <div class="rc-name">${emoji} ${escHtml(name)}</div>
      <div class="rc-type">${escHtml(addr)}</div>
    </div>`;
  });
  cardsHtml += '</div>';
  
  resultsEl.innerHTML = cardsHtml;
  scrollMessages();
}

function removeAIMessage(messageId) {
  const msgEl = document.getElementById(messageId);
  if (msgEl) msgEl.remove();
}

function addAIMessage(text, places, category, emoji) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg ai';
  let cardsHtml = '';
  if (places?.length > 0) {
    cardsHtml = '<div class="result-cards">';
    const displayPlaces = places.slice(0, 5);
    displayPlaces.forEach(p => {
      const name = p.name || p.display_name.split(',')[0];
      const addr = p.name ? `${p.distance.toFixed(1)} miles away` : p.display_name.split(',').slice(1,3).join(', ').trim();
      const lat = p.latitude || parseFloat(p.lat);
      const lon = p.longitude || parseFloat(p.lon);
      const dist = (userLat && userLon && !p.name) ? distKm(userLat, userLon, lat, lon).toFixed(1)+' km away' : '';
      cardsHtml += `<div class="result-card" onclick="window.AidLensChat.focusPlace(${lat},${lon},'${escAttr(name)}')">
        <div class="rc-name">${emoji||'📍'} ${escHtml(name)}</div>
        <div class="rc-type">${escHtml(addr)}</div>
        ${dist?`<div class="rc-dist">📍 ${dist}</div>`:''}
      </div>`;
    });
    cardsHtml += '</div>';
    if (places.length > 5) cardsHtml += `<div style="font-size:0.75rem;color:var(--mist);margin-top:8px;text-align:center;">+${places.length-5} more shown on map</div>`;
  }
  div.innerHTML = `<div class="msg-avatar"><img src = "bot pfp.png" height = "30"></img></div><div class="msg-bubble"><strong>AidLens Guide</strong><br/>${escHtml(text).replace(/\n/g,'<br/>')}${cardsHtml}</div>`;
  msgs.appendChild(div); scrollMessages();
}

function focusPlace(lat, lon) {
  map.setView([lat, lon], 16);
  resultMarkers.forEach(m => {
    const ll = m.getLatLng();
    if (Math.abs(ll.lat-lat)<0.0001 && Math.abs(ll.lng-lon)<0.0001) m.openPopup();
  });
}

function showTyping() {
  const msgs = document.getElementById('messages');
  typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.innerHTML = `<div class="msg-avatar"><img src = "bot pfp.png" height = "30"></img></div><div class="typing-dots"><span></span><span></span><span></span></div>`;
  msgs.appendChild(typingEl); scrollMessages();
}

function hideTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }
function scrollMessages() { const m = document.getElementById('messages'); setTimeout(() => m.scrollTop = m.scrollHeight, 50); }
function setLoadingBar(on) { document.getElementById('loading-bar').classList.toggle('active', on); }
function escHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(str) { return String(str).replace(/'/g,"\\'"); }
function setCategoryPrompt(text) { const i = document.getElementById('user-input'); i.value = text; i.focus(); }

// ========== EXPORTS FOR HTML ==========
window.AidLensChat = {
  initMap,
  sendMessage,
  setCategoryPrompt,
  focusPlace,
  showDirections: openDirectionsAlert
};

window.AidLensSearch = {
  setupIntegration: () => {},
  searchAndDisplay: searchWithWebJs,
  findLocation: Find,
  searchNearby: searchNearbyByPrompt
};
