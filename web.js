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

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text || isTyping) return;
  input.value = ''; input.style.height = 'auto';
  addUserMessage(text);
  isTyping = true;
  document.getElementById('send-btn').disabled = true;
  showTyping(); setLoadingBar(true);
  try {
    const { displayText, searchData } = await callAI(text);
    hideTyping();
    if (searchData) {
      let places = [];
      for (const searchTerm of (searchData.searchTerms || [])) {
        const results = await searchWithWebJs(searchTerm);
        places = [...places, ...results];
      }
      
      const seen = new Set();
      places = places.filter(p => { 
        const key = (p.name || p.display_name);
        if (seen.has(key)) return false; 
        seen.add(key); 
        return true; 
      }).slice(0,10);
      
      if (places.length > 0) {
        addAIMessage(displayText, places, searchData.category, searchData.emoji);
        addResultsToMap(places, searchData.category);
      } else {
        addAIMessage(displayText + '\n\n⚠️ I searched nearby but couldn\'t find exact listings. Try enabling your location or searching a larger city nearby. You can also call 211 (US) — a free helpline that connects you with local services.');
      }
    } else {
      addAIMessage(displayText);
    }
  } catch (err) {
    hideTyping();
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
  div.innerHTML = `<div class="msg-avatar">🤝</div><div class="msg-bubble"><strong>AidLens Guide</strong><br/>${escHtml(text).replace(/\n/g,'<br/>')}${cardsHtml}</div>`;
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
  typingEl.innerHTML = `<div class="msg-avatar">🤝</div><div class="typing-dots"><span></span><span></span><span></span></div>`;
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
