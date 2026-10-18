<?php

namespace App\Http\Requests;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Later edits to a saved log: summary, sentiment and follow-up. Its tasks are changed on the Tasks page. */
class CallLogUpdateRequest extends FormRequest
{
    // Authorizes before validating, so another person's log is a 404 rather than a 422.
    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('callLog'));
    }

    public function rules(): array
    {
        return CallLogRequest::logRules();
    }

    public function messages(): array
    {
        return CallLogRequest::logMessages();
    }
}
