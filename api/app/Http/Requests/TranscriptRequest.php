<?php

namespace App\Http\Requests;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class TranscriptRequest extends FormRequest
{
    public const MAX_CHARACTERS = 20000;

    // Authorizes before validating, so another person's note is a 404 rather than a 422.
    public function authorize(): Response
    {
        return Gate::inspect('process', $this->route('voiceNote'));
    }

    public function rules(): array
    {
        return [
            'transcript' => ['required', 'string', 'min:20', 'max:'.self::MAX_CHARACTERS],
        ];
    }

    public function messages(): array
    {
        return [
            'transcript.required' => 'Type or paste what was said in the note.',
            'transcript.min' => 'That is too short to analyze. Add a little more detail.',
            'transcript.max' => 'Keep the transcript under 20,000 characters.',
        ];
    }

    /** Line endings normalized and control characters (other than newlines and tabs) removed. */
    public function transcript(): string
    {
        $text = str_replace(["\r\n", "\r"], "\n", (string) $this->validated('transcript'));

        return trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '');
    }
}
