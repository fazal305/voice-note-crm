<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PromptSettingsRequest;
use App\Models\OrgSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * The organization's system prompt for the note parser (LlmParser). It replaces only the default description of
 * the job: the fixed safety rules (the transcript is untrusted data) and the output format are always added after it.
 */
class SettingsController extends Controller
{
    public function prompt(Request $request): JsonResponse
    {
        return $this->promptResponse($request->user());
    }

    public function updatePrompt(PromptSettingsRequest $request): JsonResponse
    {
        $settings = OrgSetting::firstOrNew(['org_id' => $request->user()->org_id]);
        $settings->forceFill(['org_id' => $request->user()->org_id, 'system_prompt' => $request->validated('system_prompt')])->save();

        return $this->promptResponse($request->user());
    }

    private function promptResponse(User $user): JsonResponse
    {
        return response()->json([
            'system_prompt' => OrgSetting::where('org_id', $user->org_id)->value('system_prompt'),
            'default_prompt' => (string) config('services.llm.system_prompt'),
            'max_length' => PromptSettingsRequest::MAX_PROMPT,
            'editable' => Gate::forUser($user)->allows('edit-prompt'),
        ]);
    }
}
