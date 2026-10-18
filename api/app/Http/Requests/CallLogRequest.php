<?php

namespace App\Http\Requests;

use App\Enums\Sentiment;
use App\Enums\TaskOwner;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/** The reviewed call log for a note: the client it was with, the edited summary, and the action items to keep. */
class CallLogRequest extends FormRequest
{
    public const MAX_SUMMARY = 1000;

    public const MAX_ITEMS = 30;

    public const MAX_ITEM_TEXT = 300;

    // Authorizes before validating, so another person's note is a 404 rather than a 422.
    public function authorize(): Response
    {
        return Gate::inspect('log', $this->route('voiceNote'));
    }

    public function rules(): array
    {
        return [
            'client_id' => ['required_without:new_client', 'prohibits:new_client', 'nullable', 'integer', Rule::exists('clients', 'id')->where('org_id', $this->user()->org_id)],
            'new_client' => ['nullable', 'array:name,company'],
            'new_client.name' => ['required_with:new_client', 'string', 'max:120'],
            'new_client.company' => ['nullable', 'string', 'max:120'],
            ...self::logRules(),
            'action_items' => ['present', 'array', 'max:'.self::MAX_ITEMS],
            'action_items.*' => ['array:text,owner,due_date,include'],
            'action_items.*.include' => ['required', 'boolean'],
            // An item left out isn't saved, so whatever is in its other fields doesn't matter.
            'action_items.*.text' => ['exclude_if:action_items.*.include,false', 'required', 'string', 'max:'.self::MAX_ITEM_TEXT],
            'action_items.*.owner' => ['exclude_if:action_items.*.include,false', 'required', Rule::enum(TaskOwner::class)],
            'action_items.*.due_date' => ['exclude_if:action_items.*.include,false', 'nullable', 'date_format:Y-m-d'],
        ];
    }

    /** The fields a saved log can still be edited with (see CallLogUpdateRequest). */
    public static function logRules(): array
    {
        return [
            'summary' => ['required', 'string', 'max:'.self::MAX_SUMMARY],
            'sentiment' => ['required', Rule::enum(Sentiment::class)],
            'follow_up' => ['nullable', 'array:date,phrase'],
            'follow_up.date' => ['nullable', 'date_format:Y-m-d'],
            'follow_up.phrase' => ['nullable', 'string', 'max:120'],
        ];
    }

    public function messages(): array
    {
        return [
            'client_id.required_without' => 'Choose the client this call was with, or add a new one.',
            'client_id.exists' => 'That client is no longer in your list. Choose another.',
            'client_id.prohibits' => 'Choose an existing client or add a new one, not both.',
            'new_client.name.required_with' => "Enter the new client's name.",
            'new_client.name.max' => 'Keep the name under 120 characters.',
            'new_client.company.max' => 'Keep the company under 120 characters.',
            'action_items.max' => 'Keep it to 30 action items or fewer.',
            'action_items.*.text.required' => 'Describe the action item, or untick it.',
            'action_items.*.text.max' => 'Keep each action item under 300 characters.',
            'action_items.*.owner.required' => 'Choose who this is for.',
            'action_items.*.due_date.date_format' => 'Enter a valid date.',
            ...self::logMessages(),
        ];
    }

    public static function logMessages(): array
    {
        return [
            'summary.required' => 'Write a short summary of the call.',
            'summary.max' => 'Keep the summary under 1,000 characters.',
            'sentiment.required' => 'Choose how the client felt.',
            'sentiment.enum' => 'Choose Positive, Neutral or Frustrated.',
            'follow_up.date.date_format' => 'Enter a valid date.',
            'follow_up.phrase.max' => 'Keep this under 120 characters.',
        ];
    }

    /** The action items to turn into tasks, whitespace collapsed. */
    public function includedItems(): array
    {
        return collect($this->validated('action_items'))
            ->filter(fn (array $item) => (bool) $item['include'])
            ->map(fn (array $item) => [
                'text' => self::clean($item['text']),
                'owner' => TaskOwner::from($item['owner']),
                'due_date' => $item['due_date'] ?? null,
            ])
            ->filter(fn (array $item) => $item['text'] !== '')
            ->values()->all();
    }

    /** Control characters out, whitespace collapsed. */
    public static function clean(?string $text): string
    {
        $text = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $text) ?? '';

        return trim(preg_replace('/\s+/u', ' ', $text) ?? '');
    }
}
