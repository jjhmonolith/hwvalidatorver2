import type * as ElevenLabs from "../../../../../../../api/index";
import * as core from "../../../../../../../core";
import type * as serializers from "../../../../../../index";
import { BodyInviteUserV1WorkspaceInvitesAddPostWorkspacePermission } from "../../types/BodyInviteUserV1WorkspaceInvitesAddPostWorkspacePermission";
export declare const InviteUserRequest: core.serialization.Schema<serializers.workspace.InviteUserRequest.Raw, ElevenLabs.workspace.InviteUserRequest>;
export declare namespace InviteUserRequest {
    interface Raw {
        email: string;
        group_ids?: string[] | null;
        workspace_permission?: BodyInviteUserV1WorkspaceInvitesAddPostWorkspacePermission.Raw | null;
    }
}
