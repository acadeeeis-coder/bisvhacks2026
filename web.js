import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});

/*  Get user input on whether user wants to let their location be accessed.  */

function Find() {
  let position = navigator.geolocation.getCurrentPosition()
  return position;
}
async function APIcall(question) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `${question} near the latitude and longitude ${Find()}`,
  });
  return response.text;
}

let response = await APIcall("Restraunts");
console.log(response)
