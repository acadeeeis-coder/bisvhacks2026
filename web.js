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
    let query = "Restraunts"
    let city = await APIcall(`What city am I in if I am at the latitude and longitude of ${coords[0]},${coords[1]}`)
    console.log(city)
    let result = await APIcall(`${query} in ${city}`)
    console.log(result)
  } else {
    console.log("Could not get location");
  }
})();

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
        { role: 'system', content: 'You will answer questions in an even format, with each part of the responce seperated by commas and in an consistent style' },
        { role: 'user', content: `
        ${question}
        format:a name, latitude, longitude, relative latitude and longitude` }]})});
  const data = await response.json();
  GivenData = data.choices[0].message.content;
  return GivenData
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