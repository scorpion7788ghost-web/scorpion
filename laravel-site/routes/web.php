<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('portfolio', ['portfolio' => config('portfolio')]);
})->name('home');
