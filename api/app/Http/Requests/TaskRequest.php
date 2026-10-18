<?php

namespace App\Http\Requests;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/** A task added by hand (POST), or a change to one (PATCH, where every field is optional). */
class TaskRequest extends FormRequest
{
    // On update this authorizes before validating, so someone else's task is a 404 rather than a 422.
    public function authorize(): Response|bool
    {
        $task = $this->route('task');

        return $task ? Gate::inspect('update', $task) : true;
    }

    public function rules(): array
    {
        if ($this->route('task')) {
            return [
                'title' => ['sometimes', 'required', 'string', 'max:'.CallLogRequest::MAX_ITEM_TEXT],
                'due_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
                'done' => ['sometimes', 'boolean'],
            ];
        }

        return [
            'title' => ['required', 'string', 'max:'.CallLogRequest::MAX_ITEM_TEXT],
            'due_date' => ['nullable', 'date_format:Y-m-d'],
            'client_id' => ['nullable', 'integer', Rule::exists('clients', 'id')->where('org_id', $this->user()->org_id)],
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Describe the task.',
            'title.max' => 'Keep the task under 300 characters.',
            'due_date.date_format' => 'Enter a valid date.',
            'client_id.exists' => 'That client is no longer in your list.',
        ];
    }
}
