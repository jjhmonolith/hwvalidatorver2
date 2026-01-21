import type * as ElevenLabs from "../index";
export interface GuardrailsV1Input {
    version?: "1";
    moderation?: ElevenLabs.ModerationGuardrailInput;
}
