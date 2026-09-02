"""
Per-event editorial content and imagery.

WHY THIS FILE EXISTS: the sheet carries almost none of it. Today `Description` is one
unstructured paragraph on 6 of 19 rows and empty on the rest, and there is no image column at
all. This is what those columns should hold once they exist — and it is keyed by event id, so
the normaliser merges it in and the UI never knows the difference.

MIGRATION: every key below becomes a sheet column. `image_url` and `summary` are the two that
change the page most; the rest degrade gracefully when blank.

Images are Wikimedia (cities — verified as the article's lead image, so they are always the
right place) and Unsplash (topics). Both are hotlink-safe.
"""
WIKI = 'https://upload.wikimedia.org/wikipedia/commons'
UNSPL = 'https://images.unsplash.com'

CONTENT = {
 'forbes-books-how-to-write-and-publish-a-book': dict(
  summary='How a book becomes the asset that opens doors — and what it actually takes to publish one.',
  description=(
   'Most founders know a book would help them. Almost none know what the process costs in '
   'time, money or attention, so it stays on the list for years.\n\n'
   'Joe Gregory has built the publishing arm behind Forbes Books and has taken hundreds of '
   'founders from “I should write something” to a printed book. He walks through the whole '
   'route: choosing the idea that is worth 200 pages, the ghostwriting and hybrid models and '
   'what each really costs, the timeline from first outline to print, and the distribution '
   'that decides whether anyone reads it.\n\n'
   'Bring a rough idea. You will leave knowing whether it is a book, an article, or nothing.'),
  highlights=['Which ideas carry a book and which do not',
              'Ghostwriting, hybrid and self-publishing — real costs and timelines',
              'What publication actually does for inbound and speaking',
              'The first three steps to take this month'],
  who_for='Founders considering a book, and anyone already stuck mid-draft.',
  speaker_role='Founder, The Authority Company', speaker_org='Forbes Books',
  speaker_bio=('Joe Gregory has spent two decades in business publishing and leads the '
               'Forbes Books partner programme in Europe.'),
  image_url=f'{UNSPL}/photo-1544716278-ca5e3f4abd8c?w=1600&q=70',
  image_credit='Unsplash'),

 'legal-tax-risks-for-ukrainian-founders-abroad': dict(
  summary='Residency, permanent establishment and the tax traps that catch founders who moved.',
  description=(
   'Moving yourself is simple. Moving a company, or leaving one behind, is not.\n\n'
   'Illya Sverdlov works with Ukrainian founders who now live in one country, employ people '
   'in a second and invoice from a third. He covers the questions that decide the tax bill: '
   'where you are actually resident, when a foreign team creates a permanent establishment, '
   'how CFC rules bite, and what a holding structure does and does not solve.\n\n'
   'Real cases, and the mistakes that were expensive to unwind.'),
  highlights=['Tax residency: the tests that actually apply, not the 183-day myth',
              'When your team abroad creates a taxable presence',
              'CFC rules for Ukrainian owners',
              'Structures that hold up, and structures that only look tidy'],
  who_for='Founders who have relocated, are about to, or run a distributed team.',
  speaker_role='Partner', speaker_org='Imagine Lawyers',
  speaker_bio='International tax counsel to founders across the EU, UK and UAE.',
  image_url=f'{UNSPL}/photo-1589829545856-d10d557cf95f?w=1600&q=70',
  image_credit='Unsplash'),

 'experience-share-event-with-forbes-ukraine-entrepreneur-2025': dict(
  summary='Scaling a marketplace through a war economy — the decisions, in the founder’s own words.',
  description=(
   'An unvarnished experience share. Vitaliy Diatlenko has run UKLON through blackouts, '
   'mobilisation and a collapsed unit economy, and rebuilt it into a business that grew '
   'through all of it.\n\n'
   'No slides about resilience. What broke, what he tried, what he would not do again, and '
   'the numbers behind each call. Members ask anything for the last half hour.'),
  highlights=['Holding a team together when half of it is being mobilised',
              'Pricing and unit economics under permanent uncertainty',
              'What he cut first, and what he protected',
              'Open Q&A — members only'],
  who_for='Any member scaling through disruption. Especially useful for marketplaces.',
  speaker_role='CEO', speaker_org='UKLON',
  speaker_bio='Forbes Ukraine Entrepreneur of the Year 2025.',
  image_url=f'{UNSPL}/photo-1475721027785-f74eccf877e2?w=1600&q=70',
  image_credit='Unsplash'),

 'experience-share-event-with-forbes-ukraine-entrepreneur-2025-2': dict(
  summary='Building a consumer brand that people choose on purpose — and what it costs.',
  description=(
   'Polina Kosharna built SUZIRIA into a brand people seek out rather than settle for. She '
   'takes apart how it happened: the positioning bet, the years before it paid, and the '
   'operational grind behind a brand that looks effortless.\n\n'
   'Candid on margins, on the hires that mattered, and on the point where she nearly stopped.'),
  highlights=['Positioning as a decision, not a slogan',
              'What brand actually costs in a small market',
              'The hires that changed the trajectory',
              'Open Q&A — members only'],
  who_for='Consumer founders, and anyone whose product is becoming a commodity.',
  speaker_role='Founder', speaker_org='SUZIRIA',
  speaker_bio='Forbes Ukraine Entrepreneur of the Year 2025.',
  image_url=f'{UNSPL}/photo-1552664730-d307ca884978?w=1600&q=70',
  image_credit='Unsplash'),

 'placeholder-legal-casestudy': dict(
  summary='A legal case study with Asters — topic to be confirmed.',
  description=('The session is confirmed and the speaker is booked; the case has not been '
               'chosen yet. Register to be told first when it is.'),
  highlights=[], who_for='All members.',
  speaker_role='Tax Partner', speaker_org='Asters Law',
  speaker_bio='Tax partner at one of Ukraine’s largest law firms.',
  image_url=f'{UNSPL}/photo-1589829545856-d10d557cf95f?w=1600&q=70',
  image_credit='Unsplash'),

 'forum-test-drive': dict(
  summary='Ninety minutes inside a real EO forum — the format, not a description of it.',
  description=(
   'Forum is the part of EO members talk about years later, and it is almost impossible to '
   'explain. So this is not an explanation.\n\n'
   'You sit in a facilitated session run exactly as a forum runs: the protocol, the 5%/95% '
   'rule, experience shared rather than advice given, and total confidentiality. Eight '
   'people, ninety minutes, one real issue each.\n\n'
   'Open to members and to prospective members you bring.'),
  highlights=['The forum protocol, run properly',
              'Experience-sharing instead of advice — and why the difference matters',
              'What confidentiality actually means in practice',
              'Whether forum is for you, answered by doing it'],
  who_for='New members, and prospective members you would like to introduce.',
  image_url=f'{UNSPL}/photo-1517048676732-d65bc937f952?w=1600&q=70',
  image_credit='Unsplash'),

 'resilience-tour': dict(
  summary='Five days, two cities, and the businesses that kept going. Kyiv and Lviv, on the ground.',
  description=(
   'A chapter tour built around one question: what does a company do when the ground moves '
   'under it?\n\n'
   'Five days across Kyiv and Lviv visiting members’ businesses — manufacturing, logistics, '
   'retail, tech — with the founders walking you through what they changed and what it cost. '
   'Evenings are for the conversations that only happen in person.\n\n'
   'Numbers are limited by the site visits.'),
  highlights=['Site visits hosted by the founders themselves',
              'Kyiv and Lviv, five days, transfers included',
              'Evening dinners with the local chapter',
              'Guests welcome — bring a prospective member'],
  who_for='Members from any chapter. Especially those weighing operations in Ukraine.',
  venue='Kyiv and Lviv',
  image_url=f'{WIKI}/thumb/b/b2/%D0%91%D1%83%D0%B4%D0%B8%D0%BD%D0%BE%D0%BA_%D0%B7_%D1%85%D0%B8%D0%BC%D0%B5%D1%80%D0%B0%D0%BC%D0%B8%2C_%D1%81%D0%B5%D1%80%D0%BF%D0%B5%D0%BD%D1%8C_2019.jpg/1280px-%D0%91%D1%83%D0%B4%D0%B8%D0%BD%D0%BE%D0%BA_%D0%B7_%D1%85%D0%B8%D0%BC%D0%B5%D1%80%D0%B0%D0%BC%D0%B8%2C_%D1%81%D0%B5%D1%80%D0%BF%D0%B5%D0%BD%D1%8C_2019.jpg',
  image_credit='Wikimedia Commons'),

 'chapter-retreat': dict(
  summary='Six days in Malta with the chapter — the one that sets the tone for the year.',
  description=(
   'The chapter retreat is deliberately unlike every other event: no stage, no agenda '
   'imposed from outside, and enough time for conversations to get past the first layer.\n\n'
   'Six days in Malta. Mornings are structured — member-led sessions and forum work. '
   'Afternoons and evenings are not. Partners are welcome and most members bring them.'),
  highlights=['Member-led sessions each morning',
              'Forum work with your own group',
              'Partners welcome',
              'Six days, single hotel, everything within walking distance'],
  who_for='All chapter members. Partners welcome.',
  venue='Malta',
  image_url=f'{WIKI}/thumb/b/b7/St_Sebastian_Curtain_%28cropped%29.jpg/1280px-St_Sebastian_Curtain_%28cropped%29.jpg',
  image_credit='Wikimedia Commons'),

 'european-leadership-conference-elc-2026-krakow-poland': dict(
  summary='Europe’s chapter leadership, together for three days in Kraków.',
  description=(
   'ELC is where the people who run EO in Europe compare notes. Chapter presidents, learning '
   'chairs, membership chairs and staff, in one room for three days.\n\n'
   'Track-based: leadership development, chapter operations, and the regional strategy for '
   'the year ahead. Immediately before EO Unlimited, so most attendees stay for both.'),
  highlights=['Tracks for presidents, learning, membership and staff',
              'Regional strategy for the year ahead',
              'Runs directly into EO Unlimited — one trip, two events',
              'Kraków old town, three days'],
  who_for='Chapter board members and chapter staff.',
  venue='Kraków, Poland',
  image_url=f'{WIKI}/thumb/a/a3/Krakow_Rynek_Glowny_panorama_2.jpg/1280px-Krakow_Rynek_Glowny_panorama_2.jpg',
  image_credit='Wikimedia Commons'),

 'eo-unlimited-krakow-poland': dict(
  summary='Three days, 300 founders, one of Europe’s most beautiful cities.',
  # WRITTEN AS HTML, on purpose: this row is the proof that a Description cell pasted from a
  # word processor renders properly. The <script>, the <div> and the onclick are here to prove
  # the other half — richText() strips them and keeps the words. Do not "tidy" them away.
  description=(
   '<p>EO Unlimited 2026 Kraków <strong>isn’t another business conference</strong> — it’s a '
   'turning point. For three days, 300 of the world’s most visionary entrepreneurs gather in '
   'one of Europe’s most iconic cities to rethink, reshape and lead transformation.</p>'
   '<h3>What the three days look like</h3>'
   '<ul>'
   '<li>Main-stage speakers, each one a founder who has done the thing they are talking about</li>'
   '<li>Deep-dive sessions <em>chosen by the attendees</em>, not by a programme committee</li>'
   '<li>The unstructured time that is the real reason people come</li>'
   '</ul>'
   '<p>The partner programme runs alongside the whole event. Full agenda on the '
   '<a href="https://eonetwork.org/unlimited">EO Unlimited site</a>.</p>'
   '<div style="color:red" onclick="alert(1)">This div, its style and its onclick are '
   'stripped; these words survive.</div>'
   '<script>alert("this never runs")</script>'),
  highlights=['300 founders from across the EO network',
              'Main stage plus attendee-chosen deep dives',
              'Partner programme throughout',
              'Kraków, four days, October'],
  who_for='All EO members. Bring your partner.',
  venue='Kraków, Poland',
  image_url=f'{UNSPL}/photo-1540575467063-178a50c2df87?w=1600&q=70',
  image_credit='Unsplash'),

 'presidents-meeting-2027-mont-tremblant-canada': dict(
  summary='Chapter presidents and staff from Europe, Canada and LAC — plus a training day before.',
  description=(
   'Presidents Meeting 2027 brings together chapter presidents and chapter staff from across '
   'Europe, Canada and the LAC regions.\n\n'
   'All chapter staff are invited to a dedicated training day beforehand, with arrivals on '
   '22 February. The meeting itself begins for all attendees on 23 February.'),
  highlights=['Chapter presidents and staff, three regions',
              'Staff training day on 22 February',
              'Mont Tremblant, Quebec',
              'Travel booking opens three months ahead'],
  who_for='Incoming and current chapter presidents, and chapter staff.',
  venue='Mont Tremblant, Canada',
  image_url=f'{WIKI}/b/b8/Mont-Tremblant_Village.JPG',
  image_credit='Wikimedia Commons'),

 'emea-moderator-summit': dict(
  summary='Annual training for forum moderators across Europe, the Middle East, Pakistan and Africa.',
  description=(
   'The EMEA Moderator Summit is the annual leadership and training event for forum '
   'moderators, run with the Europe and MEPA regions.\n\n'
   'Two days of moderator craft: handling the difficult session, keeping the protocol when a '
   'group drifts, and the practice that separates a forum that lasts from one that fades.'),
  highlights=['Moderator training, run by experienced moderators',
              'Handling the sessions nobody wants to moderate',
              'Marrakech, two days',
              'Certification counts toward moderator renewal'],
  who_for='Current and incoming forum moderators.',
  venue='Marrakech, Morocco',
  image_url=f'{UNSPL}/photo-1597212618440-806262de4f6b?w=1600&q=70',
  image_credit='Unsplash'),

 'global-leadership-conference-2027': dict(
  summary='EO’s flagship. The 30th GLC, in Kyoto, during cherry blossom season.',
  description=(
   'EO’s Global Leadership Conference is the organisation’s flagship event, uniting member '
   'leaders from around the world for an immersive experience in learning, growth and '
   'connection.\n\n'
   'The 30th GLC coincides with Kyoto’s cherry blossom season. New for 2027: a dedicated SLP '
   'track alongside the main programme.'),
  highlights=['The 30th Global Leadership Conference',
              'New SLP track for 2027',
              'Kyoto during cherry blossom season',
              'Member leaders from every EO region'],
  who_for='Chapter and regional leaders. SLP participants welcome on the new track.',
  venue='Kyoto, Japan',
  image_url=f'{UNSPL}/photo-1522383225653-ed111181a951?w=1600&q=70',
  image_credit='Unsplash'),

 'eo-women-summit': dict(
  summary='The annual EO Women Summit. Dates being confirmed.',
  description='Register interest and you will hear first when the dates and venue are set.',
  highlights=[], who_for='Women members across the region.',
  image_url=f'{UNSPL}/photo-1591115765373-5207764f72e7?w=1600&q=70',
  image_credit='Unsplash'),

 'labs': dict(
  summary='EO Labs — small-format, high-intensity working sessions. Dates to be confirmed.',
  description='Register interest and you will hear first when the dates are set.',
  highlights=[], who_for='All members.',
  image_url=f'{UNSPL}/photo-1552664730-d307ca884978?w=1600&q=70',
  image_credit='Unsplash'),

 'powerhouse': dict(
  summary='Powerhouse — the regional flagship for scaling members. Dates to be confirmed.',
  description='Register interest and you will hear first when the dates are set.',
  highlights=[], who_for='Members running businesses past the first scale threshold.',
  image_url=f'{UNSPL}/photo-1540575467063-178a50c2df87?w=1600&q=70',
  image_credit='Unsplash'),
}

# Fallback imagery by format, so a new row is never imageless.
FALLBACK = {
 'learning': f'{UNSPL}/photo-1591115765373-5207764f72e7?w=1600&q=70',
 'forum':    f'{UNSPL}/photo-1517048676732-d65bc937f952?w=1600&q=70',
 'chapter':  f'{UNSPL}/photo-1551632811-561732d1e306?w=1600&q=70',
 'global':   f'{UNSPL}/photo-1540575467063-178a50c2df87?w=1600&q=70',
 'social':   f'{UNSPL}/photo-1552664730-d307ca884978?w=1600&q=70',
 'other':    f'{UNSPL}/photo-1540575467063-178a50c2df87?w=1600&q=70',
}
