import type * as ElevenLabs from "../../api/index";
import * as core from "../../core";
import * as serializers from "../index";
import { ApiIntegrationWebhookOverridesOutputRequestHeadersValue } from "./ApiIntegrationWebhookOverridesOutputRequestHeadersValue";
import { LiteralOverride } from "./LiteralOverride";
import { QueryOverride } from "./QueryOverride";
export declare const ApiIntegrationWebhookOverridesOutput: core.serialization.ObjectSchema<serializers.ApiIntegrationWebhookOverridesOutput.Raw, ElevenLabs.ApiIntegrationWebhookOverridesOutput>;
export declare namespace ApiIntegrationWebhookOverridesOutput {
    interface Raw {
        path_params_schema?: Record<string, LiteralOverride.Raw | null | undefined> | null;
        query_params_schema?: QueryOverride.Raw | null;
        request_body_schema?: serializers.ObjectOverrideOutput.Raw | null;
        request_headers?: Record<string, ApiIntegrationWebhookOverridesOutputRequestHeadersValue.Raw | null | undefined> | null;
    }
}
