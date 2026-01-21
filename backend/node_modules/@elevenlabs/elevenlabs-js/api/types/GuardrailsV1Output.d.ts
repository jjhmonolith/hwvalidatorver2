import type * as ElevenLabs from "../index";
export interface GuardrailsV1Output {
    version?: "1";
    moderation?: ElevenLabs.ModerationGuardrailOutput;
}
