<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="{{ $portfolio['name'] }} — {{ $portfolio['role'] }}. Selected work, creative approach, and contact information.">
    <title>{{ $portfolio['name'] }} — Portfolio</title>
    <link rel="stylesheet" href="{{ asset('css/portfolio.css') }}">
    <script src="{{ asset('js/portfolio.js') }}" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="header wrap">
    <a class="brand" href="{{ route('home') }}" aria-label="{{ $portfolio['name'] }} home"><span class="brand-mark" aria-hidden="true">✳</span> {{ $portfolio['name'] }}<span class="brand-dot">.</span></a>
    <nav aria-label="Main navigation"><a href="#work">Work</a><a href="#about">About</a><a class="nav-contact" href="#contact">Let’s talk <span aria-hidden="true">↗</span></a></nav>
</header>
<main id="main">
    <section class="hero wrap" aria-labelledby="hero-title">
        <div class="eyebrow"><span class="status-dot"></span> {{ $portfolio['role'] }}</div>
        <h1 id="hero-title">Thoughtful design.<br><span>Purposeful code.</span><span class="hero-star" aria-hidden="true">✳</span></h1>
        <div class="hero-bottom"><p>{{ $portfolio['intro'] }}</p><a class="button" href="#work">Explore my work <span aria-hidden="true">↘</span></a></div>
        <div class="hero-foot"><span>Independent thinking. Intentional making.</span><span>SCROLL TO EXPLORE ↓</span></div>
    </section>
    <section class="work wrap section" id="work" aria-labelledby="work-title">
        <div class="section-top"><div><span class="eyebrow">01 / THE PORTFOLIO</span><h2 id="work-title">Selected work<span class="small-dot">.</span></h2></div><div class="filters" role="group" aria-label="Filter projects"><button class="active" data-filter="all" aria-pressed="true">All work</button><button data-filter="design" aria-pressed="false">Web design</button><button data-filter="development" aria-pressed="false">Development</button></div></div>
        <p class="demo-note">A few sample concepts to show what’s possible. Replace these with your own projects.</p>
        <div class="project-grid">
            @foreach ($portfolio['projects'] as $project)
            <article class="project" data-category="{{ $project['type'] }}">
                <button class="project-cover {{ $project['theme'] }}" data-project="{{ $project['slug'] }}" aria-label="Read about {{ $project['name'] }}">
                    <span class="mock-browser"><span class="mock-top"><span>● ● ●</span><span>{{ strtolower($project['name']) }}.studio</span><span>↗</span></span><span class="mock-body"><span class="mock-logo">{{ $project['name'] }}<span>®</span></span><span class="mock-title">{{ $project['title'] }}</span><span class="mock-art" aria-hidden="true"><i></i><i></i><i></i></span><span class="mock-caption">A SAMPLE PROJECT · {{ $project['category'] }}</span></span></span>
                    <span class="cover-arrow" aria-hidden="true">↗</span>
                </button>
                <div class="project-meta"><div><h3><button data-project="{{ $project['slug'] }}">{{ $project['name'] }}</button></h3><p>{{ $project['category'] }} <span> / Sample concept</span></p></div><span aria-hidden="true">0{{ $loop->iteration }}</span></div>
            </article>
            @endforeach
        </div>
        <p class="sr-only" id="filter-status" aria-live="polite"></p>
    </section>
    <section class="about-band" id="about"><div class="wrap about section"><div><span class="eyebrow">02 / A LITTLE ABOUT ME</span><h2>Curiosity is<br>where it starts<span class="small-dot">.</span></h2><span class="about-star" aria-hidden="true">✳</span></div><div class="about-copy"><p class="large-copy">Good work starts with understanding the people who will use it.</p><p>{{ $portfolio['about'] }}</p><h3>My toolkit</h3><div class="skills">@foreach ($portfolio['skills'] as $skill)<span>{{ $skill }}</span>@endforeach</div></div></div></section>
    <section class="contact wrap section" id="contact"><span class="eyebrow">03 / WHAT’S NEXT?</span><h2>Have something<br>in mind? <span>Let’s build it.</span></h2><div class="contact-bottom"><p>A new idea, a collaboration, or simply a hello.<br>Every good project starts with a conversation.</p>@if ($portfolio['email'])<a class="button" href="mailto:{{ $portfolio['email'] }}">Say hello <span aria-hidden="true">↗</span></a>@else<span class="contact-placeholder">Your contact details are coming soon.</span>@endif</div></section>
</main>
<footer class="wrap footer"><span>© {{ date('Y') }} {{ $portfolio['name'] }}</span><span>Made with care. Built with Laravel.</span><a href="#main">Back to top ↑</a></footer>
@foreach ($portfolio['projects'] as $project)
<dialog id="project-{{ $project['slug'] }}" aria-labelledby="title-{{ $project['slug'] }}"><button class="dialog-close" aria-label="Close project">×</button><span class="eyebrow">SAMPLE CONCEPT / {{ $project['category'] }}</span><h2 id="title-{{ $project['slug'] }}">{{ $project['name'] }}</h2><p>{{ $project['description'] }}</p><p class="dialog-stack">{{ $project['stack'] }}</p><p class="demo-note">This is demonstration content, not a completed client project.</p></dialog>
@endforeach
</body>
</html>
