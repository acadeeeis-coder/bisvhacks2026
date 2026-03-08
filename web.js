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

async function APIcall(question) {
  const response = await fetch('https://api.featherless.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer rc_f1cfe1eab5a7595f51c586e03883df18b0667d38314a198f860d3eaf6a6fd4ab'
    },
    body: JSON.stringify({
      model: 'Qwen/Qwen2.5-7B-Instruct',
      messages: [
        { role: 'system', content: 'You will answer questions in an even format, with each part of the response separated by commas and in a consistent style. Triple check each answer, and ground the results by using online maps to check. Make numbers have up to 10 trailing decimals behind them. Return results as a list separated by semicolons.' },
        { role: 'user', content: `${question}\nFormat each result as: name, latitude, longitude` }]})});
  const data = await response.json();
  GivenData = data.choices[0].message.content;
  return GivenData;
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
    const question = `Convert this prompt into ONE OpenStreetMap search tag. Return ONLY a single word tag, nothing else. Prompt: ${prompt}. Examples: hospital, restaurant, police, library, bank, pharmacy, clinic, food_bank, shelter`;
    const response = await APIcall(question);
    // Extract only the first word/tag, remove any coordinates or extra data
    const tag = response.trim().toLowerCase().split(/[,;\s]+/)[0];
    return tag || prompt.toLowerCase();
  } catch (err) {
    console.warn("Could not determine search type from AI, using prompt as fallback");
    return prompt.toLowerCase();
  }
}

// Search OpenStreetMap Overpass API for real verified places
async function searchOpenStreetMap(searchType, latitude, longitude) {
  try {
    const radius = 5000; // Search within 5km
    
    // Build Overpass API query
    const overpassQuery = buildOverpassQuery(searchType, latitude, longitude, radius);
    
    console.log("Querying Overpass API...");
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: overpassQuery,
      headers: { 'Content-Type': 'application/osm3s+xml' }
    });
    
    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }
    
    const xml = await response.text();
    const places = parseOverpassXML(xml, latitude, longitude);
    
    return places.length > 0 ? places : await fallbackNominatimSearch(searchType, latitude, longitude);
  } catch (err) {
    console.warn("Overpass API failed, using Nominatim fallback:", err);
    return await fallbackNominatimSearch(searchType, latitude, longitude);
  }
}

// Build Overpass API query for the search type
function buildOverpassQuery(searchType, lat, lon, radius) {
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
  
  // Overpass API bbox format is: south,west,north,east (lat,lon,lat,lon)
  const south = lat - 0.045;  // ~5km south
  const west = lon - 0.045;
  const north = lat + 0.045;  // ~5km north
  const east = lon + 0.045;
  
  return `[bbox:${south},${west},${north},${east}];(node[${tag}];way[${tag}];relation[${tag}];);out center;`;
}

// Parse Overpass XML response
function parseOverpassXML(xml, userLat, userLon) {
  const places = [];
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'text/xml');
  
  // Get all nodes and ways with names
  const nodes = xmlDoc.querySelectorAll('node[visible="true"]');
  const ways = xmlDoc.querySelectorAll('way[visible="true"]');
  
  nodes.forEach(node => {
    const nameTag = node.querySelector('tag[k="name"]');
    if (nameTag) {
      const lat = parseFloat(node.getAttribute('lat'));
      const lon = parseFloat(node.getAttribute('lon'));
      places.push({
        name: nameTag.getAttribute('v'),
        latitude: lat,
        longitude: lon,
        source: 'OpenStreetMap',
        distance: calculateDistance(userLat, userLon, lat, lon)
      });
    }
  });
  
  ways.forEach(way => {
    const nameTag = way.querySelector('tag[k="name"]');
    const centerTag = way.querySelector('center');
    if (nameTag && centerTag) {
      const lat = parseFloat(centerTag.getAttribute('lat'));
      const lon = parseFloat(centerTag.getAttribute('lon'));
      places.push({
        name: nameTag.getAttribute('v'),
        latitude: lat,
        longitude: lon,
        source: 'OpenStreetMap',
        distance: calculateDistance(userLat, userLon, lat, lon)
      });
    }
  });
  
  return places.sort((a, b) => a.distance - b.distance).slice(0, 10);
}

// Fallback: Use Nominatim API if Overpass fails
async function fallbackNominatimSearch(searchType, latitude, longitude) {
    try {
      console.log("Using Nominatim fallback search for:", searchType);
      
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
        `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&lat=${latitude}&lon=${longitude}&limit=10&format=json`,
        { headers: { 'User-Agent': 'AidLens-App' } }
      );
      
      if (!response.ok) {
        console.error("Nominatim API error:", response.status);
        return [];
      }
      
      const results = await response.json();
      
      if (!results || results.length === 0) {
        console.log("No results from Nominatim");
        return [];
      }
      
      return results.map(place => ({
        name: place.name,
        latitude: parseFloat(place.lat),
        longitude: parseFloat(place.lon),
        source: 'OpenStreetMap (Nominatim)',
        distance: calculateDistance(latitude, longitude, parseFloat(place.lat), parseFloat(place.lon))
      })).sort((a, b) => a.distance - b.distance);
  } catch (err) {
    console.error("Nominatim fallback also failed:", err);
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

// Example usage - test with real OpenStreetMap data
(async () => {
  console.log("Initializing AidLens search with real OpenStreetMap data...");
  const results = await searchNearbyByPrompt("hospital");
  if (results && results.length > 0) {
    console.log(`Found ${results.length} results:`);
    results.forEach((place, i) => {
      console.log(`${i + 1}. ${place.name} - ${place.distance.toFixed(2)} miles away (${place.source})`);
    });
  } else {
    console.log("No results found");
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
