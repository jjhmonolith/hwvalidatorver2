import type * as ElevenLabs from "../../api/index";
import * as core from "../../core";
import * as serializers from "../index";
import { ApiIntegrationWebhookOverridesInputRequestHeadersValue } from "./ApiIntegrationWebhookOverridesInputRequestHeadersValue";
import { LiteralOverride } from "./LiteralOverride";
import { QueryOverride } from "./QueryOverride";
export declare const ApiIntegrationWebhookOverridesInput: core.serialization.ObjectSchema<serializers.ApiIntegrationWebhookOverridesInput.Raw, ElevenLabs.ApiIntegrationWebhookOverridesInput>;
export declare namespace ApiIntegrationWebhookOverridesInput {
    interface Raw {
        path_params_schema?: Record<string, LiteralOverride.Raw | null | undefined> | null;
        query_params_schema?: QueryOverride.Raw | null;
        request_body_schema?: serializers.ObjectOverrideInput.Raw | null;
        request_headers?: Record<string, ApiIntegrationWebhookOverridesInputRequestHeadersValue.Raw | null | undefined> | null;
    }
}
