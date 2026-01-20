import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// ElevenLabs TTS configuration
const hasElevenLabsKey = Boolean(process.env.ELEVENLABS_API_KEY);
const elevenlabs = hasElevenLabsKey
  ? new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
  : null;
const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || 'XB0fDUnXU5powFXDhCwa'; // Charlotte - multilingual
const elevenLabsModel = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';

// OpenAI for STT (Whisper)
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
const openai = hasOpenAIKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/**
 * Convert text to speech using ElevenLabs
 * @param {string} text - Text to convert
 * @returns {Promise<Buffer>} Audio buffer (MP3)
 */
export async function textToSpeech(text) {
  if (!elevenlabs) {
    throw new Error('ElevenLabs API not configured');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Text is required');
  }

  const audioStream = await elevenlabs.textToSpeech.convert(elevenLabsVoiceId, {
    text: text.slice(0, 5000),
    modelId: elevenLabsModel,
    outputFormat: 'mp3_44100_128',
  });

  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Convert speech to text using OpenAI Whisper
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} mimetype - Audio MIME type
 * @param {string} context - Context for better transcription
 * @returns {Promise<string>} Transcribed text
 */
export async function speechToText(audioBuffer, mimetype = 'audio/webm', context = '') {
  if (!openai) {
    throw new Error('OpenAI API not configured');
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Audio file is required');
  }

  const file = new File([audioBuffer], 'audio.webm', { type: mimetype });

  const transcription = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file: file,
    language: 'ko',
    prompt: context.slice(0, 500),
  });

  return transcription.text;
}

/**
 * Check if TTS is available
 */
export function isTTSAvailable() {
  return hasElevenLabsKey && elevenlabs !== null;
}

/**
 * Check if STT is available
 */
export function isSTTAvailable() {
  return hasOpenAIKey && openai !== null;
}

export default {
  textToSpeech,
  speechToText,
  isTTSAvailable,
  isSTTAvailable,
};
