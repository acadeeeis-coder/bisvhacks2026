import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});

/*  Get user input on whether user wants to let their location be accessed.  */

function Find() {
  let position = navigator.geolocation.getCurrentPosition()
  return position;
}
async function APIcall() {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: input+'at this location: '+ Find(),
  });
  return response.text;
}

await APIcall();
