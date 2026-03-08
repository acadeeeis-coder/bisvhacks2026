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
    'meta-llama/Llama-2-70b-chat-hf',  // Stronger model - primary
    'Qwen/Qwen2.5-32B-Instruct',       // Strong alternative
    'Qwen/Qwen2.5-7B-Instruct'         // Fallback
  ];
  
  const currentModel = models[Math.min(retryCount, models.length - 1)];
  
  try {
    console.log(`🤖 AI Call [Attempt ${retryCount + 1}/${maxRetries + 1}] using ${currentModel}`);
    console.log(`📝 Question: ${question.substring(0, 80)}${question.length > 80 ? '...' : ''}`);
    
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
    console.log(`✅ API Response: "${content.substring(0, 100)}"`);
    
    GivenData = content;
    return content;
    
  } catch (err) {
    console.warn(`⚠️ API Error (${currentModel}): ${err.message}`);
    
    // Retry with next model if available
    if (retryCount < maxRetries) {
      console.log(`🔄 Retrying with different model...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      return APIcall(question, retryCount + 1, maxRetries);
    } else {
      console.error(`❌ All API attempts exhausted`);
      throw err;
    }
  }
}

// Main function: search for nearby places by prompt using OpenStreetMap
async function searchNearbyByPrompt(prompt) {
  try {
    console.log("Searching for:", prompt);
    
    // Get user location
    const coords = await Find();
    if (!coords) {
      console.error("Could not get user location");
      return null;
    }
    
    console.log("User location:", coords);
    
    // Use AI to understand what type of place to search for
    const searchType = await determineSearchType(prompt);
    console.log("Search type determined:", searchType);
    
    // Query OpenStreetMap Overpass API for real places
    const places = await searchOpenStreetMap(searchType, coords[0], coords[1]);
    
    console.log("Found places:", places);
    return places;
  } catch (err) {
    console.error("Error searching nearby:", err);
    return null;
  }
}

// Use AI to understand what type of place the user is looking for
async function determineSearchType(prompt) {
  try {
    console.log(`\n📍 SEARCH UNDERSTANDING: "${prompt}"`);
    
    // Create comprehensive prompt for AI to understand user intent
    const comprehensiveQuestion = `You are a location search specialist. Convert this user request into a single, specific OpenStreetMap search term. 

User Request: "${prompt}"

Rules:
- Return ONLY one search term
- Common options: restaurant, hospital, clinic, pharmacy, police, library, bank, lawyer, food_bank, shelter, cafe, bar, pizza, burger, sushi, doctor, dentist, veterinary, atm, parking
- For "help" or "assistance" → lawyer
- For "food" or "eat" → restaurant
- For "medical" → hospital
- For "emergency" → police
- For complex requests, extract the primary need

Return ONLY the single search term, no explanation.`;
    
    const response = await APIcall(comprehensiveQuestion);
    
    // Multiple extraction strategies for robustness
    let tag = response
      .trim()
      .toLowerCase()
      .replace(/["'.]/g, '')  // Remove quotes and apostrophes
      .split(/[,;:\n|]/)[0]   // Split on common delimiters and take first
      .trim()
      .split(/\s+/)[0];        // Take first word only
    
    // Validate and fallback
    if (!tag || tag.length < 2 || tag.length > 20) {
      console.warn(`⚠️ Unusual tag extracted: "${tag}", using original prompt`);
      tag = prompt.toLowerCase().split(/\s+/)[0];
    }
    
    console.log(`🏷️ Extracted Search Tag: "${tag}"`);
    return tag;
    
  } catch (err) {
    console.warn(`❌ Search type determination failed: ${err.message}`);
    console.log(`📌 Fallback: Using first word of prompt`);
    const fallbackTag = prompt.toLowerCase().split(/\s+/)[0];
    return fallbackTag || 'restaurant';
  }
}

// Search OpenStreetMap Overpass API with expanding radius loop
async function searchOpenStreetMap(searchType, latitude, longitude) {
  // Convert miles to approximate degrees (1 degree ≈ 69 miles)
  const milesPerDegree = 69;
  
  // Search radius progression: start at 5 miles, expand to 90 miles
  const searchRadii = [
    { miles: 5, name: 'very close' },
    { miles: 10, name: 'close' },
    { miles: 15, name: 'nearby' },
    { miles: 20, name: 'moderate distance' },
    { miles: 30, name: 'medium distance' },
    { miles: 45, name: 'far' },
    { miles: 60, name: 'very far' },
    { miles: 90, name: 'maximum distance' }
  ];
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎯 SEARCH INITIATED FOR: ${searchType.toUpperCase()}`);
  console.log(`📍 Location: ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`);
  console.log(`${'═'.repeat(60)}\n`);
  
  // Try progressively larger search radii
  for (let i = 0; i < searchRadii.length; i++) {
    const radiusInfo = searchRadii[i];
    const delta = radiusInfo.miles / milesPerDegree;
    const maxDistance = radiusInfo.miles;
    
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🔄 SEARCH ITERATION ${i + 1}/${searchRadii.length}`);
    console.log(`📏 Radius: ${radiusInfo.miles} miles (${radiusInfo.name})`);
    console.log(`${'─'.repeat(60)}`);
    
    // Retry logic for API glitches
    let retryCount = 0;
    const maxRetries = 2;
    let places = [];
    let success = false;
    
    while (retryCount <= maxRetries && !success) {
      try {
        // Build and execute Overpass query
        const overpassQuery = buildOverpassQuery(searchType, latitude, longitude, delta);
        
        if (retryCount > 0) {
          console.log(`\n🔁 Retry attempt ${retryCount}/${maxRetries}...`);
        }
        console.log(`🔍 Querying Overpass API...`);
        console.log(`📝 Query delta: ${delta.toFixed(4)} degrees (±${radiusInfo.miles} miles)`);
        
        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: overpassQuery,
          headers: { 'Content-Type': 'application/osm3s+xml' }
        });
        
        console.log(`📡 Response status: ${response.status}`);
        
        if (!response.ok) {
          if (response.status >= 500) {
            // Server error - retry with backoff
            console.warn(`⚠️ Overpass returned ${response.status} (server error)`);
            if (retryCount < maxRetries) {
              const backoffTime = Math.pow(2, retryCount) * 1000;
              console.log(`⏳ Waiting ${backoffTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, backoffTime));
              retryCount++;
              continue;
            }
          }
          console.warn(`⚠️ Overpass returned ${response.status}, skipping to next radius...`);
          break;
        }
        
        const responseText = await response.text();
        console.log(`📦 Received ${responseText.length} characters`);
        
        if (!responseText || responseText.length < 10) {
          throw new Error('Empty or invalid response from Overpass');
        }
        
        // Parse response
        places = parseOverpassXML(responseText, latitude, longitude, maxDistance);
        success = true;
        
        console.log(`✅ Parsed ${places.length} places`);
        
        if (places.length > 0) {
          console.log(`\n${'═'.repeat(60)}`);
          console.log(`🎉 SUCCESS! Found ${places.length} results in ${radiusInfo.name} (${radiusInfo.miles} miles)`);
          console.log(`${'═'.repeat(60)}\n`);
          
          places.forEach((place, idx) => {
            console.log(`  ${idx + 1}. ${place.name}`);
            console.log(`     📍 (${place.latitude.toFixed(4)}°, ${place.longitude.toFixed(4)}°)`);
            console.log(`     📏 ${place.distance.toFixed(2)} miles away\n`);
          });
          
          return places;
        } else {
          console.log(`❌ No results at ${radiusInfo.miles} miles, expanding search...`);
        }
      } catch (err) {
        console.warn(`⚠️ Error at ${radiusInfo.miles} miles (attempt ${retryCount + 1}):`, err.message);
        if (retryCount < maxRetries && (err.message.includes('glitch') || err.message.toLowerCase().includes('timeout'))) {
          const backoffTime = Math.pow(2, retryCount) * 1000;
          console.log(`⏳ Waiting ${backoffTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          retryCount++;
        } else {
          break;
        }
      }
    }
  }
  
  // If all Overpass attempts failed, try Nominatim fallback
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`⚠️ Overpass exhausted all radii up to 90 miles`);
  console.log(`🔄 Attempting Nominatim fallback search...`);
  console.log(`${'═'.repeat(60)}\n`);
  
  return await fallbackNominatimSearch(searchType, latitude, longitude, 90);
}

// Build Overpass API query with variable delta
function buildOverpassQuery(searchType, lat, lon, delta) {
  // Map common search terms to OpenStreetMap amenity/shop tags
  const tagMappings = {
    'hospital': 'amenity=hospital',
    'clinic': 'amenity=clinic',
    'doctor': 'amenity=doctors',
    'pharmacy': 'shop=pharmacy',
    'restaurant': 'amenity=restaurant',
    'food': 'amenity=restaurant',
    'food_bank': 'amenity=food_bank',
    'shelter': 'amenity=shelter',
    'legal': 'amenity=lawyer',
    'police': 'amenity=police',
    'library': 'amenity=library',
    'bank': 'amenity=bank',
    'atm': 'amenity=atm'
  };
  
  let tag = tagMappings[searchType];
  if (!tag) {
    tag = `amenity=${searchType}`;
  }
  
  const [key, value] = tag.split('=');
  
  // Calculate bounding box with provided delta
  const south = lat - delta;
  const west = lon - delta;
  const north = lat + delta;
  const east = lon + delta;
  
  // Overpass API query with JSON output
  return `[out:json][timeout:60];(node["${key}"="${value}"](${south},${west},${north},${east});way["${key}"="${value}"](${south},${west},${north},${east});relation["${key}"="${value}"](${south},${west},${north},${east}););out center;`;
}

// Parse Overpass JSON/XML response
function parseOverpassXML(responseText, userLat, userLon, maxDistance) {
  const places = [];
  
  try {
    // Check if we got JSON response
    if (responseText.includes('"type"') || responseText.startsWith('{')) {
      console.log('💾 Attempting to parse as JSON...');
      const data = JSON.parse(responseText);
      console.log(`📊 JSON parsed successfully with ${data.elements?.length || 0} elements`);
      
      if (data.elements && data.elements.length > 0) {
        data.elements.forEach((element, idx) => {
          if (element.tags && element.tags.name) {
            const elemLat = element.lat || (element.center && element.center.lat);
            const elemLon = element.lon || (element.center && element.center.lon);
            
            if (elemLat && elemLon) {
              const distance = calculateDistance(userLat, userLon, elemLat, elemLon);
              console.log(`  [${idx}] ${element.tags.name} @ (${elemLat.toFixed(4)}, ${elemLon.toFixed(4)}) = ${distance.toFixed(2)} miles`);
              
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
                                  console.log('⚠️ JSON parsing failed, trying XML fallback...');
                                  try {
                                    const parser = new DOMParser();
                                    const xmlDoc = parser.parseFromString(responseText, 'text/xml');
                                    const nodes = xmlDoc.querySelectorAll('node');
                                    const ways = xmlDoc.querySelectorAll('way');

                                    console.log(`📊 XML parsed with ${nodes.length} nodes and ${ways.length} ways`);

                                  nodes.forEach(node => {
                                      const nameTag = node.querySelector('tag[k=\"name\"]');
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
                                      const nameTag = way.querySelector('tag[k=\"name\"]');
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
                                    console.error('❌ Both JSON and XML parsing failed:', xmlErr);

                                }
                            }

                              return places.sort((a, b) => a.distance - b.distance).slice(0, 10);
                          }


// Fallback: Use Nominatim API if Overpass exhausts all radii
async function fallbackNominatimSearch(searchType, latitude, longitude, maxDistance) {
    try {
      console.log(`🔍 Nominatim Search Parameters:`);
      console.log(`   searchType: ${searchType}`);
      console.log(`   location: ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`);
      console.log(`   maxDistance: ${maxDistance} miles`);
      
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
      
      console.log(`📤 Sending Nominatim request...`);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&lat=${latitude}&lon=${longitude}&limit=20&format=json`,
        { headers: { 'User-Agent': 'AidLens-App' } }
      );
      
      console.log(`📥 Nominatim response: ${response.status}`);
      
      if (!response.ok) {
        console.error("❌ Nominatim API error:", response.status);
        return [];
      }
      
      const results = await response.json();
      
      if (!results || results.length === 0) {
        console.log("❌ Nominatim returned 0 results");
        return [];
      }
      
      console.log(`📊 Nominatim returned ${results.length} total results`);
      
      const filtered = results
        .map(place => ({
          name: place.name,
          latitude: parseFloat(place.lat),
          longitude: parseFloat(place.lon),
          source: 'OpenStreetMap (Nominatim)',
          distance: calculateDistance(latitude, longitude, parseFloat(place.lat), parseFloat(place.lon))
        }))
        // Filter by max distance
        .filter(place => {
          const isWithinRadius = place.distance <= maxDistance;
          console.log(`   - ${place.name}: ${place.distance.toFixed(2)} miles ${isWithinRadius ? '✅' : '❌'}`);
          return isWithinRadius;
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);
      
      console.log(`\n✅ Nominatim: Found ${filtered.length} results within ${maxDistance} miles`);
      return filtered;
  } catch (err) {
    console.error("❌ Nominatim fallback error:", err);
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

// Example usage - test with real OpenStreetMap data with expanding radius
(async () => {
  console.log("\n" + "=".repeat(70));
  console.log("AIDLENS LOCATION SEARCH ENGINE");
  console.log("=".repeat(70));
  console.log("Starting search with progressive radius expansion...");
  console.log("Radius progression: 5 -> 10 -> 15 -> 20 -> 30 -> 45 -> 60 -> 90 miles");
  console.log("=".repeat(70) + "\n");
  
  const results = await searchNearbyByPrompt("restaurant");
  
  if (results && results.length > 0) {
    console.log("\n" + "=".repeat(70));
    console.log("SEARCH COMPLETE: Found " + results.length + " results");
    console.log("=".repeat(70) + "\n");
    
    results.forEach((place, i) => {
      console.log((i + 1) + ". " + place.name);
      console.log("   Coordinates: " + place.latitude.toFixed(4) + "N, " + place.longitude.toFixed(4) + "W");
      console.log("   Distance: " + place.distance.toFixed(2) + " miles");
      console.log("   Source: " + place.source);
      console.log();
    });
    
    console.log("=".repeat(70));
  } else {
    console.log("\n" + "=".repeat(70));
    console.log("NO RESULTS found within 90 mile radius");
    console.log("=".repeat(70));
  }
})();


const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
});

const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
  });
}, { threshold: 0.12 });
reveals.forEach(el => observer.observe(el));
