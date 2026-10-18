<?php

namespace App\Http\Requests;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** The organization's own system prompt for the note parser. Empty means "use the default". */
class PromptSettingsRequest extends FormRequest
{
    public const MAX_PROMPT = 4000;

    public function authorize(): Response
    {
        return Gate::inspect('edit-prompt');
    }

    protected function prepareForValidation(): void
    {
        $prompt = $this->input('system_prompt');
        if (is_string($prompt)) {
            // Line breaks are kept; other control characters are dropped.
            $prompt = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', str_replace("\r\n", "\n", $prompt)) ?? '');
            $this->merge(['system_prompt' => $prompt === '' ? null : $prompt]);
        }
    }

    public function rules(): array
    {
        return [
            'system_prompt' => ['present', 'nullable', 'string', 'max:'.self::MAX_PROMPT],
        ];
    }

    public function messages(): array
    {
        return [
            'system_prompt.present' => 'Send the prompt, or an empty one to use the default.',
            'system_prompt.string' => 'The prompt must be text.',
            'system_prompt.max' => 'Keep the prompt under '.number_format(self::MAX_PROMPT).' characters.',
        ];
    }
}
