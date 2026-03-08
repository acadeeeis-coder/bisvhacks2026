/*  Get user input on whether user wants to let their location be accessed.  */
let GivenData = [];

async function Find() {
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject)
    );
    return [pos.coords.latitude,pos.coords.longitude];
  } catch (err) {
    console.error("Error getting location:", err);
    return null; 
  }
}

(async () => {
  console.log("called")
  const coords = await Find();
  if (coords) {
    console.log(coords)
    APIcall("Restraunts",coords[0], coords[1])
  } else {
    console.log("Could not get location");
  }
})();

async function APIcall(question, lon, lat) {
  const response = await fetch('https://api.featherless.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer rc_f1cfe1eab5a7595f51c586e03883df18b0667d38314a198f860d3eaf6a6fd4ab'
    },
    body: JSON.stringify({
      model: 'Qwen/Qwen2.5-7B-Instruct',
      messages: [
        { role: 'system', content: 'You are going to answer questions with a Json Format, listing each answer for the question. You will give numbers with an integer accuracy up to 10 decimals ' },
        { role: 'user', content: `
        ${question} near the latitude and longitude of ${lat},${lon} 
        format:a name, latitude, longitude, relative latitude and longitude` }]})});
  const data = await response.json();
  GivenData = JSON.parse(data.choices[0].message.content);
  console.log(GivenData)
}


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
