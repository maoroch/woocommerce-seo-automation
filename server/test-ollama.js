// test-ollama.js
import { callOllama } from './src/lib/ollama.js';

const response = await callOllama(
  "Ты — e-commerce копирайтер. Верни ТОЛЬКО JSON, никаких пояснений.",
  "Улучши description для товара: {\"id\":25121,\"description\":\"<p>Test.</p>\"}"
);
console.log("ОТВЕТ:\n", response);