<?php

namespace App\Enums;

/** Whose commitment a task is: the rep's own, or something the client said they would do. */
enum TaskOwner: string
{
    case Rep = 'rep';
    case Client = 'client';
}
