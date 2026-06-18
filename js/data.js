/* =============================================================================
   MURDER AT VERIDIAN ISLE — STORY DATA
   -----------------------------------------------------------------------------
   All narrative content lives here so the writer (Charlie) and rule-maker
   (Vivaan) can tune the story and the deduction logic without touching the
   engine. Nothing in this file draws to the screen — it is pure content.
   ========================================================================== */

const GAME = {
  meta: {
    title: "Murder at Veridian Isle",
    tagline: "A billionaire. A private island. A guest who will not see sunrise.",
    victim: "Dr. Iris Vale",
    detectiveDefault: "Detective",
  },

  /* ---------------------------------------------------------------------------
     THE PREMISE — shown during onboarding / briefing
  --------------------------------------------------------------------------- */
  briefing: {
    intro: [
      "A polished obsidian box arrived at your door three days ago. No sender. " +
        "Inside, a single brass key and an engraved card: “You are invited to " +
        "Veridian Isle for the birthday of Augustus Crane. Bring your sharpest mind.”",
      "Augustus Crane built an empire on Helios — the “infinite” clean-energy cell that " +
        "rewired the world and made him the richest man alive. Once a year he gathers " +
        "his inner circle on his private island to toast himself beneath the stars.",
      "You are not part of his circle. You are a detective — and nobody will say who " +
        "invited you. By the time the midnight champagne is poured, one of the guests " +
        "lies dead on the pavilion floor.",
    ],
    deadline:
      "The launch ferry returns at dawn. Whoever did this means to leave on it. " +
      "You have until sunrise to read the island, weigh the evidence, and name the killer.",
  },

  /* ---------------------------------------------------------------------------
     THE VICTIM
  --------------------------------------------------------------------------- */
  victim: {
    name: "Dr. Iris Vale",
    role: "The Co-Founder Who Was Erased",
    found: "Found at 12:07 a.m. on the Star Pavilion, moments after the birthday toast.",
    bio:
      "The true inventor of the Helios cell. Years ago Augustus forced her out of the " +
      "company they built together, buried her name, and rewrote history with himself as " +
      "the lone genius. She had not been seen in public since — until tonight, when she " +
      "walked off the ferry uninvited, carrying a slim leather folio and a quiet smile.",
  },

  /* ---------------------------------------------------------------------------
     THE SUSPECTS  (id, name, role/title, the line they want you to believe)
     `monogram` is rendered as typographic art — there are no images anywhere.
  --------------------------------------------------------------------------- */
  suspects: [
    {
      id: "augustus",
      name: "Augustus Crane",
      title: "The Visionary · Host & Billionaire",
      monogram: "AC",
      tagline: "“Iris and I made peace years ago. I wanted her here. Why would I kill the one person who understood me?”",
      bio:
        "Charismatic, theatrical, impossible to read. He insists Iris's return was a " +
        "reconciliation he arranged himself. Everyone assumes the billionaire is guilty — " +
        "which is exactly the kind of thing a billionaire would count on.",
    },
    {
      id: "selene",
      name: "Selene Marsh",
      title: "The Right Hand · Chief Operating Officer",
      monogram: "SM",
      tagline: "“I handed Iris a glass as a peace offering. That is hardly a crime. I gave my life to this company.”",
      bio:
        "Runs Veridian's day-to-day with surgical control. Calm, precise, and easy to " +
        "overlook beside Augustus's spectacle — which is how she likes it. Her entire " +
        "fortune and freedom are welded to the company's story staying exactly as told.",
    },
    {
      id: "kane",
      name: "Dr. Idris Kane",
      title: "The Architect · Chief Scientist",
      monogram: "IK",
      tagline: "“Yes, the toxin came from my lab. So does half the medicine that kept this party standing. That proves nothing.”",
      bio:
        "The mind who turned Iris's stolen design into a shippable product — and, the " +
        "rumor goes, signed off on safety data that was never real. Anxious, brilliant, " +
        "and one disclosure away from prison.",
    },
    {
      id: "vivienne",
      name: "Vivienne Cross",
      title: "The Muse · Public Face & Fiancée",
      monogram: "VC",
      tagline: "“I was live the entire toast — four hundred thousand people can vouch for me, darling.”",
      bio:
        "The brand's glittering public face and Augustus's fiancée. Lives through her " +
        "camera, which means her every move tonight is timestamped for the world to see. " +
        "Devoted to the lifestyle Veridian's myth pays for.",
    },
    {
      id: "theo",
      name: "Theo Sandoval",
      title: "The Sentinel · Head of Security",
      monogram: "TS",
      tagline: "“I keep this island locked down. If something went wrong tonight, it wasn't on my watch — ask the logs.”",
      bio:
        "Ex-military, fiercely loyal, controls every camera, keycard, and door on the isle. " +
        "He cleans up Augustus's messes for a living. The question is whether tonight he was " +
        "cleaning up — or covering for — someone.",
    },
  ],

  /* ---------------------------------------------------------------------------
     EVIDENCE  — every clue the player can collect.
       type: physical | document | testimony | timeline | digital
       tag : one-word category shown on the card
       The `implicates` map is the deduction backbone (see SOLUTION below).
  --------------------------------------------------------------------------- */
  evidence: {
    // --- Scene 1: The Star Pavilion (crime scene search) ---
    ev_glass: {
      title: "Iris's Champagne Flute",
      type: "physical", tag: "Toxin", scene: "pavilion",
      text:
        "A single flute beside Iris, drained to the dregs. A field tox-strip turns " +
        "violet against the residue — a synthetic neurotoxin, fast and silent. " +
        "Hers is the only contaminated glass on the pavilion.",
    },
    ev_bottle: {
      title: "The Untouched Magnum",
      type: "physical", tag: "Method", scene: "pavilion",
      text:
        "The birthday champagne — a single great bottle everyone was poured from. " +
        "It tests perfectly clean. The poison was never in the bottle. It was added to " +
        "one glass alone: the glass placed into Iris's hand.",
    },
    ev_phone: {
      title: "Iris's Phone — A Voice Memo",
      type: "digital", tag: "Threat", scene: "pavilion",
      text:
        "Her last recording, 11:58 p.m.: “If I don't make it off this rock, it's " +
        "because of what's in the folio. They all knew Helios was a lie. By Monday, " +
        "the whole world will too.”",
    },
    ev_folio: {
      title: "The Empty Leather Folio",
      type: "physical", tag: "Missing", scene: "pavilion",
      text:
        "The folio Iris carried off the ferry — now empty, its papers gone. Whoever " +
        "killed her wanted what was inside. Someone at this party is carrying the truth " +
        "in their pocket.",
    },
    ev_invite: {
      title: "A Second Invitation",
      type: "document", tag: "Mystery", scene: "pavilion",
      text:
        "Tucked in Iris's coat: an invitation identical to yours, in the same hand. " +
        "Neither of you was invited by Augustus. Someone wanted a detective on this " +
        "island the same night they wanted Iris here.",
    },

    // --- Scene 2: The Shoreline (timeline reconstruction) ---
    ev_timeline: {
      title: "The Night's True Timeline",
      type: "timeline", tag: "Sequence", scene: "shoreline",
      text:
        "Reconstructed from staff and footage: 9:30 guests arrive · 10:40 Iris confronts " +
        "Augustus privately · 11:14 a keycard opens the Helios Lab · 11:45 guests gather " +
        "for the toast · 12:00 the single glasses are handed out · 12:07 Iris collapses.",
    },
    ev_labwindow: {
      title: "The 11:14 Lab Entry",
      type: "timeline", tag: "Window", scene: "shoreline",
      text:
        "The only moment all night the Helios Lab was opened: 11:14 p.m. — forty-six " +
        "minutes before the toast. Long enough to draw a vial of toxin and slip back to " +
        "the party before anyone missed you.",
    },

    // --- Scene 3: The Helios Lab (keycard-log logic puzzle) ---
    ev_keycard: {
      title: "The Keycard Access Log",
      type: "digital", tag: "Access", scene: "lab",
      text:
        "Only one card opened the lab at 11:14 p.m. Cross-checked against every guest's " +
        "alibi, the log clears Kane (in the medical bay), Augustus (on stage), Vivienne " +
        "(livestreaming), and Theo (at the docks). The card was Selene Marsh's.",
    },
    ev_vial: {
      title: "The Empty Toxin Vial",
      type: "physical", tag: "Smoking Gun", scene: "lab",
      text:
        "Behind a planter on the path between the lab and the pavilion: an empty vial " +
        "from Kane's neurotoxin stock, wiped of prints but not of its catalog number — " +
        "checked out of the lab at 11:14 p.m. The murder weapon, and the hand that drew it.",
    },

    // --- Scene 4: The Study & Server Room (documents → motive) ---
    ev_report: {
      title: "The Falsified Helios Safety Report",
      type: "document", tag: "Fraud", scene: "study",
      text:
        "The original test data shows Helios cells overheat catastrophically. A second, " +
        "published version — with the failures deleted — bears Idris Kane's signature " +
        "and Selene Marsh's countersignature. The product the world runs on is a lie they " +
        "both signed.",
    },
    ev_expose: {
      title: "Iris's Exposé Draft",
      type: "document", tag: "Reveal", scene: "study",
      text:
        "A printout from the folio's backup: Iris's exposé, naming names. It proves Helios " +
        "was her invention, stolen; that the safety data was forged; and — critically — " +
        "that the original patents still legally belong to her. Her return undoes everyone.",
    },
    ev_emails: {
      title: "Selene's Deleted Emails",
      type: "digital", tag: "Motive", scene: "study",
      text:
        "Recovered from the server: Selene to her lawyer, three weeks ago. “If Vale " +
        "reinstates the original patents, I lose the company AND I'm the one who signed the " +
        "fraud. I will not go to prison for Augustus's vanity. She cannot be allowed to " +
        "publish.”",
    },
    ev_ownership: {
      title: "The Patent Ownership Papers",
      type: "document", tag: "Stakes", scene: "study",
      text:
        "Legal filings confirm it: if Iris went public, the patents revert to her, Veridian " +
        "collapses, and whoever signed the forged safety data takes the criminal fall. " +
        "Augustus loses money. Selene loses everything and her freedom.",
    },

    // --- Scene 5: The Veranda (interrogations → opportunity) ---
    ev_peace: {
      title: "The “Peace Offering”",
      type: "testimony", tag: "Opportunity", scene: "veranda",
      text:
        "Three guests confirm it, and Selene admits it: at the toast she personally carried " +
        "a glass to Iris — “a peace offering between the two women who built this place.” " +
        "She was the only person to hand Iris a glass that no one else had touched.",
    },
    ev_selene_slip: {
      title: "Selene's Contradiction",
      type: "testimony", tag: "Lie", scene: "veranda",
      text:
        "Selene swears she “never set foot in the lab tonight.” But the keycard log puts " +
        "her card inside at 11:14, and the vial's catalog number matches that entry. " +
        "Pressed on it, she has no answer that holds.",
    },
    ev_theo_cover: {
      title: "Theo's Quiet Cover-Up",
      type: "testimony", tag: "Cover", scene: "veranda",
      text:
        "Theo admits he blanked the lab corridor camera at 11:10 p.m. — “a standing order " +
        "to protect Mr. Crane's privacy.” He thought he was covering for Augustus. He was " +
        "unknowingly clearing the path for Selene.",
    },
  },

  /* ---------------------------------------------------------------------------
     SCENES — each is a DIFFERENT interaction so the game never feels repetitive.
       kind: hotspot | timeline | logicgrid | documents | interrogation
  --------------------------------------------------------------------------- */
  scenes: [
    {
      id: "pavilion",
      kind: "hotspot",
      name: "The Star Pavilion",
      order: 1,
      blurb: "Where Iris fell, moments after the toast. The party scattered; the evidence did not.",
      lead:
        "Glasses glitter abandoned on the floor. The sea hisses below the deck. " +
        "Examine everything before the staff “tidy” it away — click each point of interest.",
      hotspots: [
        { id: "h_glass", label: "The flute by her hand", x: 26, y: 58, evidence: "ev_glass" },
        { id: "h_bottle", label: "The birthday magnum", x: 70, y: 40, evidence: "ev_bottle" },
        { id: "h_phone", label: "A phone, screen still lit", x: 48, y: 72, evidence: "ev_phone" },
        { id: "h_folio", label: "An open leather folio", x: 82, y: 66, evidence: "ev_folio" },
        { id: "h_coat", label: "Iris's folded coat", x: 14, y: 34, evidence: "ev_invite" },
      ],
    },
    {
      id: "shoreline",
      kind: "timeline",
      name: "The Shoreline Walk",
      order: 2,
      blurb: "Reconstruct the evening. Every alibi lives or dies on the order of events.",
      lead:
        "Staff statements and camera stamps lie scattered out of order. Place the night's " +
        "events on the timeline in sequence to expose the one window that matters.",
      // Player drags/clicks these into chronological order:
      events: [
        { id: "t1", time: "9:30 p.m.", text: "Guests arrive by ferry; the party begins." },
        { id: "t2", time: "10:40 p.m.", text: "Iris confronts Augustus alone in the study." },
        { id: "t3", time: "11:14 p.m.", text: "A keycard opens the Helios Lab — the only entry all night." },
        { id: "t4", time: "11:45 p.m.", text: "Guests are summoned to the pavilion for the toast." },
        { id: "t5", time: "12:00 a.m.", text: "Individual glasses are handed out for the birthday toast." },
        { id: "t6", time: "12:07 a.m.", text: "Iris collapses. She is dead within minutes." },
      ],
      reward: ["ev_timeline", "ev_labwindow"],
    },
    {
      id: "lab",
      kind: "logicgrid",
      name: "The Helios Lab",
      order: 3,
      blurb: "The toxin came from here. Use the alibis to deduce whose keycard opened the door.",
      lead:
        "The lab was opened once tonight — 11:14 p.m. — by a single keycard. Match each " +
        "guest to where the evidence places them at that moment. Only the truth unlocks.",
      // Logic grid: assign each suspect to a place at 11:14 p.m.
      places: ["On stage", "Medical bay", "Livestreaming", "At the docks", "In the lab"],
      solutionGrid: {
        augustus: "On stage",
        kane: "Medical bay",
        vivienne: "Livestreaming",
        theo: "At the docks",
        selene: "In the lab",
      },
      hints: [
        "Augustus was mid-speech on the pavilion stage — a hundred witnesses.",
        "Dr. Kane was in the medical bay treating a guest who fainted.",
        "Vivienne's livestream ran unbroken; the timestamps never lie.",
        "Theo logged himself at the docks, watching the ferry moorings.",
        "That leaves exactly one person unaccounted for at 11:14.",
      ],
      reward: ["ev_keycard", "ev_vial"],
    },
    {
      id: "study",
      kind: "documents",
      name: "The Study & Server Room",
      order: 4,
      blurb: "Paper never panics. Read what they tried to delete and find out who could not afford the truth.",
      lead:
        "Iris came to destroy the lie that Helios was built on. Read the documents — each " +
        "reveals who had a reason to stop her, and who had the most to lose of all.",
      docs: ["ev_report", "ev_expose", "ev_emails", "ev_ownership"],
    },
    {
      id: "veranda",
      kind: "interrogation",
      name: "The Veranda",
      order: 5,
      blurb: "Sit them down one by one. Press on what you already know and watch the story crack.",
      lead:
        "The suspects wait on the veranda, drinks in hand and stories rehearsed. Question " +
        "each of them — a contradiction only surfaces once you hold the evidence that exposes it.",
      // Each suspect: lines of dialogue and a "press" that yields evidence IF prerequisite held.
      interviews: [
        {
          suspect: "augustus",
          opener: "“Ask me anything, detective. I have nothing to hide — a rare luxury, these days.”",
          press: {
            label: "Press: “Why invite the woman you erased?”",
            requires: "ev_invite",
            reply:
              "“I didn't send for her. And I didn't send for you either. Someone wanted us all " +
              "in the same room tonight — someone who knew exactly how this would look. " +
              "Convenient, isn't it, that the obvious villain is the loudest man in the room?”",
            yields: null,
          },
        },
        {
          suspect: "kane",
          opener: "“The toxin is mine, fine. But I never left the medical bay — check the log, please, check it.”",
          press: {
            label: "Press: “Who else could open your lab?”",
            requires: "ev_keycard",
            reply:
              "“Only executive cards override the lab lock. Augustus's. Mine. And Selene's. " +
              "Mine was in the medical bay with me the whole time. Do the arithmetic.”",
            yields: null,
          },
        },
        {
          suspect: "vivienne",
          opener: "“I was live, sweetheart. Four hundred thousand alibis with the timestamps to match.”",
          press: {
            label: "Press: “Did you see who reached Iris last?”",
            requires: "ev_timeline",
            reply:
              "“Oh, everyone toasted. But Iris? Selene brought her a glass herself. Made a whole " +
              "speech of it — ‘the two women who built Veridian.’ I got it on camera. Adorable, " +
              "until it wasn't.”",
            yields: "ev_peace",
          },
        },
        {
          suspect: "theo",
          opener: "“My logs are clean. I was at the docks. Everything that happened, happened on a camera I run.”",
          press: {
            label: "Press: “Why did the lab corridor camera go dark at 11:10?”",
            requires: "ev_labwindow",
            reply:
              "“…I blanked it. Standing order to protect Mr. Crane's privacy near the lab. " +
              "I thought I was covering for him. If someone used that blind window — God. " +
              "I opened the door and never saw who walked through.”",
            yields: "ev_theo_cover",
          },
        },
        {
          suspect: "selene",
          opener: "“I'm the one who keeps this company breathing. I'd never burn down what I built.”",
          press: {
            label: "Press: “Your card opened the lab at 11:14. Explain.”",
            requires: "ev_vial",
            reply:
              "“That's— that's impossible. I never set foot in the lab tonight. I was… " +
              "I—” She stops. Her hand finds the edge of the table. For the first time all " +
              "night, Selene Marsh has nothing rehearsed to say.",
            yields: "ev_selene_slip",
          },
        },
      ],
    },
  ],

  /* ---------------------------------------------------------------------------
     DEDUCTION MATRIX — the rule-maker's domain.
     For each suspect × axis, the TRUTH and the clue that proves it.
       status: "yes" | "no"
       proof : evidence id the player must hold to confirm that cell
     Motive is shared (everyone is threatened), but only ONE suspect lands
     YES on all three axes: the killer.
  --------------------------------------------------------------------------- */
  matrix: {
    augustus: {
      means:       { status: "no",  proof: "ev_keycard", note: "His card never opened the lab." },
      motive:      { status: "yes", proof: "ev_ownership", note: "Exposure costs him a fortune." },
      opportunity: { status: "no",  proof: "ev_timeline", note: "On stage during the toast — witnessed." },
    },
    selene: {
      means:       { status: "yes", proof: "ev_vial", note: "Her card drew the toxin at 11:14." },
      motive:      { status: "yes", proof: "ev_emails", note: "Loses the company AND takes the fraud fall." },
      opportunity: { status: "yes", proof: "ev_peace", note: "Personally handed Iris her glass." },
    },
    kane: {
      means:       { status: "yes", proof: "ev_keycard", note: "Owns the toxin — but his card stayed put." },
      motive:      { status: "yes", proof: "ev_report", note: "Signed the forged safety data." },
      opportunity: { status: "no",  proof: "ev_keycard", note: "In the medical bay; never near her glass." },
    },
    vivienne: {
      means:       { status: "no",  proof: "ev_keycard", note: "No lab access, no toxin." },
      motive:      { status: "yes", proof: "ev_ownership", note: "Her lifestyle dies with the company." },
      opportunity: { status: "no",  proof: "ev_keycard", note: "Livestreaming, hands full, on camera." },
    },
    theo: {
      means:       { status: "no",  proof: "ev_theo_cover", note: "Opened the door, but drew no vial." },
      motive:      { status: "no",  proof: "ev_emails", note: "Loyal muscle — no personal stake in the lie." },
      opportunity: { status: "no",  proof: "ev_timeline", note: "At the docks during the toast." },
    },
  },

  /* ---------------------------------------------------------------------------
     THE SOLUTION
  --------------------------------------------------------------------------- */
  solution: {
    suspect: "selene",
    method: "glass",       // see accusation.methods
    smokingGun: "ev_vial",
  },

  accusation: {
    methods: [
      { id: "glass", label: "Neurotoxin slipped into Iris's individual glass", correct: true },
      { id: "bottle", label: "Poison hidden in the birthday champagne bottle", correct: false,
        rebuttal: "The magnum tested perfectly clean — only Iris's single glass was contaminated." },
      { id: "drown", label: "Pushed from the pavilion deck into the sea", correct: false,
        rebuttal: "Iris was found on the pavilion floor with a violet tox-strip, not in the water." },
      { id: "staged", label: "A staged accident — no murder at all", correct: false,
        rebuttal: "Her own voice memo named the threat minutes before she died. This was no accident." },
    ],
    // The decisive piece of evidence the player must name:
    smokingGunPrompt: "Which single piece of evidence proves it beyond doubt?",
  },

  /* ---------------------------------------------------------------------------
     ENDINGS
  --------------------------------------------------------------------------- */
  endings: {
    win: {
      title: "Case Closed: Selene Marsh",
      body:
        "It was never about Augustus's spectacle. While the island watched the billionaire " +
        "preen, Selene Marsh used her executive keycard to open the Helios Lab at 11:14, drew " +
        "a vial of Kane's neurotoxin, and carried it to the one place no one would suspect: a " +
        "“peace offering” pressed into Iris's hand at the toast. Iris's return would have " +
        "reinstated her patents, collapsed Veridian, and sent the woman who signed the forged " +
        "safety data to prison. Augustus would have lost money. Selene would have lost " +
        "everything — so she made sure Iris's truth died on the pavilion with her. Almost. " +
        "The folio's backup survived. By Monday, the world will know all of it.",
    },
    lose: {
      title: "The Ferry Sails at Dawn",
      wrongSuspect:
        "The accusation doesn't hold. Means, motive, and opportunity have to meet in one " +
        "person — and the evidence you've laid out points somewhere else. The real killer " +
        "boards the dawn ferry with Iris's truth in their pocket.",
      wrongMethod:
        "You named the right person, but the wrong method — and a good lawyer needs only " +
        "one crack. Look again at how the poison reached Iris and nobody else.",
      wrongGun:
        "Right killer, right method — but the evidence you pointed to doesn't clinch it. " +
        "Find the one item that ties this specific hand to this specific death.",
    },
  },

  /* ---------------------------------------------------------------------------
     TEAM — the makers. No images anywhere: pure typographic monograms.
  --------------------------------------------------------------------------- */
  team: [
    {
      name: "Kian",
      role: "Coder",
      monogram: "K",
      blurb:
        "Built the engine that runs the island — the game state, the scene interactions, " +
        "the deduction logic, and the save system that remembers your investigation.",
    },
    {
      name: "Andrew",
      role: "Designer",
      monogram: "A",
      blurb:
        "Shaped the look and feel of Veridian Isle — the dark-ocean palette, the typography, " +
        "the layout and the mood that turns a web page into a crime scene.",
    },
    {
      name: "Vivaan",
      role: "Rule Maker",
      monogram: "V",
      blurb:
        "Designed how the mystery actually plays — the means/motive/opportunity logic, the " +
        "deduction matrix, and the conditions that decide whether your accusation holds.",
    },
    {
      name: "Charlie",
      role: "Writer",
      monogram: "C",
      blurb:
        "Wrote the murder — the victim, the suspects, every clue and line of dialogue, and " +
        "the twist that makes the quietest person in the room the most dangerous.",
    },
  ],

  /* ---------------------------------------------------------------------------
     RULES / HOW TO PLAY
  --------------------------------------------------------------------------- */
  rules: {
    objective:
      "One guest at Veridian Isle is a murderer. Your job is to gather evidence, reason " +
      "out who had the means, motive, AND opportunity, and make a single correct " +
      "accusation before the ferry sails at dawn.",
    controls: [
      ["Mouse / click", "Everything is mouse-driven. Click scenes, hotspots, cards, and choices."],
      ["Case File", "Your hub. Choose which location to investigate next — in any order."],
      ["Notebook", "Every clue you collect is filed here automatically, grouped by type."],
      ["Deduction", "The board where you turn raw clues into conclusions about each suspect."],
      ["Progress", "Your investigation saves automatically in this browser. Refresh freely."],
    ],
    loop: [
      {
        h: "1 · Investigate the scenes",
        p: "Each location plays differently — search a crime scene, rebuild a timeline, crack " +
           "a keycard logic puzzle, read documents, and interrogate suspects. No two scenes " +
           "ask the same thing of you.",
      },
      {
        h: "2 · Collect evidence",
        p: "Clues come in types — physical, digital, documents, testimony, timeline. Some " +
           "corroborate a suspect; others contradict an alibi. They all land in your Notebook.",
      },
      {
        h: "3 · Build deductions",
        p: "On the Deduction board, confirm for each suspect whether they had the Means, the " +
           "Motive, and the Opportunity — each conclusion must be backed by a clue you actually " +
           "found. Everyone has a motive; only the killer has all three.",
      },
      {
        h: "4 · Make the accusation",
        p: "When the evidence converges, name the killer, the method, and the single piece of " +
           "proof that clinches it. Get all three right and the case is closed.",
      },
    ],
    tips: [
      "Everyone on this island has a motive — motive alone never proves guilt.",
      "An alibi that breaks under evidence is worth more than a confession.",
      "Interrogations only crack open once you're holding the clue that exposes the lie.",
      "The loudest suspect is rarely the most dangerous one.",
    ],
    win:
      "You win by submitting an accusation that names the correct killer, the correct method, " +
      "and the correct decisive evidence. Wrong on any count and the killer escapes on the " +
      "dawn ferry — but you can always re-examine the evidence and try again.",
  },
};

// Expose globally for the engine.
window.GAME = GAME;
