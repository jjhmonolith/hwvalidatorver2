import type * as ElevenLabs from "../../../../../../api/index";
import * as core from "../../../../../../core";
import type * as serializers from "../../../../../index";
export declare const BodyUpdateMemberV1WorkspaceMembersPostWorkspaceRole: core.serialization.Schema<serializers.workspace.BodyUpdateMemberV1WorkspaceMembersPostWorkspaceRole.Raw, ElevenLabs.workspace.BodyUpdateMemberV1WorkspaceMembersPostWorkspaceRole>;
export declare namespace BodyUpdateMemberV1WorkspaceMembersPostWorkspaceRole {
    type Raw = "workspace_admin" | "workspace_member";
}
