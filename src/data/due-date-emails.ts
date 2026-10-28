// "Your Week, In Your Inbox" — one short email per week of pregnancy,
// weeks 10-40, sent to Spit-Up Society members who gave a due date.
// Sent by src/lib/due-date-sender.ts from the daily cron in worker-entry.mjs.
// Voice: John, short sentences, no dashes, one job per week. General info only;
// never medical advice. Edit freely; the sender reads this file as-is.

export interface WeekEmail {
  week: number;
  subject: string;
  body: string[]; // paragraphs
}

const TOOLS = "Your Free Tools are in the member area: thedudelaco.com/member/tools";
const KIT = "If you want the whole plan in one place, the Dudela Prep Kit takes about an hour: thedudelaco.com/kit";

export const WEEK_EMAILS: WeekEmail[] = [
  { week: 10, subject: "Week 10. Welcome to the club.", body: [
    "Week 10. The baby is about the size of a strawberry, and your partner may feel a lot worse than that sounds.",
    "Nausea and exhaustion are common right now. She is building a human from scratch. Expect naps. Expect smells to be a problem.",
    "Your one thing this week: take one recurring chore completely off her plate. Not help with it. Own it.",
  ]},
  { week: 11, subject: "Week 11. The questions list.", body: [
    "Week 11. Appointments are coming fast, and they go faster than you think.",
    "Your one thing this week: start a shared note on your phones called Questions for the Doctor. Anything either of you wonders about goes in it. Bring it to every appointment.",
    "You will feel less like a passenger the moment you walk in with a list.",
  ]},
  { week: 12, subject: "Week 12. Who do you tell?", body: [
    "Week 12. Many couples start telling people around now. Some wait longer. There is no right answer.",
    "Your one thing this week: decide together who hears it, when, and from whom. Her family first, or yours? A call or in person? Decide before someone asks.",
    "It is a small thing. It stops a big argument later.",
  ]},
  { week: 13, subject: "Week 13. End of the first trimester.", body: [
    "Week 13. Last week of the first trimester. For a lot of couples, energy starts coming back soon.",
    "Your one thing this week: plan one normal date. Dinner, a movie, a walk. Not a baby conversation. Just the two of you.",
    "You will have plenty of baby talk ahead. Protect a little of what you had before.",
  ]},
  { week: 14, subject: "Week 14. The money talk.", body: [
    "Week 14. Good time for the conversation nobody wants to start: money.",
    "Your one thing this week: look up what your job offers for leave, and ask her to do the same. Write down the dates and the pay. No decisions yet. Just facts.",
    "Most dads find out what their leave policy is way too late. Don't be that guy.",
  ]},
  { week: 15, subject: "Week 15. Read the room.", body: [
    "Week 15. Hormones are real, and jokes land differently right now. Mike learned this the hard way on Womb Watch.",
    "Your one thing this week: when she is having a rough day, skip the fix. Ask, \"Do you want help, or do you want me to listen?\" Then do that.",
    "That one question solves more than you would expect.",
  ]},
  { week: 16, subject: "Week 16. Active, not passive.", body: [
    "Week 16. There is a big difference between being supportive and being useful.",
    "Your one thing this week: notice what she needs before she asks. A nap, a walk, five minutes alone. Make it happen without her having to manage you.",
    "Being the guy she does not have to manage is the whole game.",
  ]},
  { week: 17, subject: "Week 17. Start thinking about names.", body: [
    "Week 17. If you have not started on names, now is a good time. It takes longer than you think.",
    "Your one thing this week: each of you writes five names you like. Swap lists. Only discuss the ones you both don't hate.",
    "Mike and Abigail's names fight is on Womb Watch if you want to see how not to do it.",
  ]},
  { week: 18, subject: "Week 18. The anatomy scan is coming.", body: [
    "Week 18. The big anatomy scan usually happens around weeks 18 to 22.",
    "Your one thing this week: find out when yours is and block it on your calendar now. This is the appointment worth taking off work for.",
    "You get to see the heart, the spine, the hands. It gets real in that room.",
  ]},
  { week: 19, subject: "Week 19. Is the house ready?", body: [
    "Week 19. Not the nursery yet. The house.",
    "Your one thing this week: walk the house and make a list of anything that needs fixing before the baby comes. The loose railing, the smoke detector batteries, the car that needs tires.",
    "Do the boring stuff now while you still have weekends.",
  ]},
  { week: 20, subject: "Week 20. Halfway. Here's your job this week.", body: [
    "Week 20. Halfway there.",
    "The anatomy scan usually lands right around now. They check the heart, the brain, ten fingers and ten toes. Clear your schedule and be in the room.",
    "Your one thing this week: ask her what she has been worrying about that she hasn't said out loud. Then just listen. Don't fix it.",
    "Mike and Abigail's big scan is on Womb Watch if you want to see what it looks like.",
  ]},
  { week: 21, subject: "Week 21. Feel that?", body: [
    "Week 21. Many partners start feeling real movement around now. Soon you may be able to feel it from the outside too.",
    "Your one thing this week: when she says the baby is kicking, drop what you are doing and come put your hand there. Every time.",
    "It might take a few tries. It's worth it.",
  ]},
  { week: 22, subject: "Week 22. The registry.", body: [
    "Week 22. Time to build the registry, and to keep it lean. Babies need way less than the internet says.",
    "Your one thing this week: open the Baby Shower Checklist with her and cross off everything you will not actually use. Spend on what lasts more than one stage.",
    TOOLS,
  ]},
  { week: 23, subject: "Week 23. Classes.", body: [
    "Week 23. Birth classes, newborn care, infant CPR. They fill up, so sign up now.",
    "Your one thing this week: pick one class and book it for the two of you. Infant CPR is the one most dads are glad they took.",
    "You do not have to know everything. You do need somewhere to start.",
  ]},
  { week: 24, subject: "Week 24. Who is your village?", body: [
    "Week 24. You will need help after the baby comes. Most couples wait until they are drowning to ask.",
    "Your one thing this week: write down three people you could call at 2 AM, and three people who could bring a meal. Tell them now that you might.",
    "People want to help. They just need you to ask.",
  ]},
  { week: 25, subject: "Week 25. Talk about the first two weeks.", body: [
    "Week 25. Picture the first two weeks home. Who is doing nights? Who is visiting? When?",
    "Your one thing this week: have the visitors conversation with her. Who comes, when, and for how long. Then you are the one who enforces it.",
    "Being the bouncer is one of the best jobs a new dad can have.",
  ]},
  { week: 26, subject: "Week 26. Take care of yourself too.", body: [
    "Week 26. Something nobody tells dads: you can get worn down too. Stress, sleep, worry. It adds up.",
    "Your one thing this week: pick one thing that keeps you steady. A workout, a run, a call with a friend. Put it on the calendar and protect it.",
    "A steady dad is not a dad who never struggles. It is a dad who takes care of himself so he can show up.",
  ]},
  { week: 27, subject: "Week 27. Last week of the second trimester.", body: [
    "Week 27. Last week of the second trimester. The third one moves fast.",
    "Your one thing this week: plan something just for her. A massage, a nice dinner, a day she does not have to plan anything.",
    "She has been carrying this for six months. Literally.",
  ]},
  { week: 28, subject: "Third trimester. The finish line just got real.", body: [
    "Week 28. Third trimester.",
    "Around now she will likely do the glucose test. Fast, drink a tiny bottle of pure sugar, then a blood draw. It is not fun. Drive her, bring a snack for after, and have something good planned for the evening.",
    "Your one thing this week: start the hospital bag. The checklist is in your Free Tools.",
    TOOLS,
  ]},
  { week: 29, subject: "Week 29. The birth plan.", body: [
    "Week 29. Time to talk about the birth plan. Not to control the day. To know what matters to her.",
    "Your one thing this week: fill out the Birth Plan Template together. Then remember this: plans change. Mike and Abigail's turned into an emergency C-section in about 90 seconds.",
    "Your job is not the plan. Your job is her, whatever happens.",
  ]},
  { week: 30, subject: "Week 30. Ten weeks out.", body: [
    "Week 30. Ten weeks. Appointments usually get more frequent from here.",
    "Your one thing this week: talk about how you will each handle the first night home. Who sleeps when. Who handles what. Make a plan you can both live with.",
    KIT,
  ]},
  { week: 31, subject: "Week 31. Learn the route.", body: [
    "Week 31. Do you know exactly how to get to the hospital? And where to park? And which door to use after hours?",
    "Your one thing this week: do a dry run. Drive it, find the parking, find the entrance. Time it.",
    "When it is go time, you do not want to be googling the labor and delivery entrance.",
  ]},
  { week: 32, subject: "Week 32. The nursery.", body: [
    "Week 32. If the nursery is not done, now is the time.",
    "Your one thing this week: assemble the crib, the dresser, whatever needs building. Do it while she watches and tells you it's crooked.",
    "It is a rite of passage. Embrace it.",
  ]},
  { week: 33, subject: "Week 33. The car seat.", body: [
    "Week 33. The car seat. Nobody leaves the hospital without one.",
    "Your one thing this week: buy it if you haven't, install it, and get it checked. Many fire stations and hospitals check them for free.",
    "Five minutes of checking beats a lot of worry later.",
  ]},
  { week: 34, subject: "Week 34. Your bag too.", body: [
    "Week 34. Her bag is not the only one. You need one too.",
    "Your one thing this week: pack yours. Phone charger with a long cable, snacks, a change of clothes, a toothbrush, a pillow. You might be there a while.",
    "The full list is in the Hospital Bag Checklist in your Free Tools.",
  ]},
  { week: 35, subject: "Week 35. Know the signs.", body: [
    "Week 35. Time to know what labor can look like and when to call.",
    "Your one thing this week: ask her provider what to watch for and when to call or go in. Write it down. Put the number in your phone under something you will find fast.",
    "When it happens, you want to be the calm one with the plan.",
  ]},
  { week: 36, subject: "Four weeks out. Is the car seat in?", body: [
    "Week 36. The baby could come any time in the next few weeks.",
    "Your one thing this week: double check the car seat is installed and the bags are in the car or by the door.",
    KIT,
  ]},
  { week: 37, subject: "Week 37. Clear your plate.", body: [
    "Week 37. Things can move fast from here.",
    "Your one thing this week: tell your boss and your team the plan. Who covers what. How to reach you. Then hand things off so you can leave on a moment's notice.",
    "Work will survive without you. Promise.",
  ]},
  { week: 38, subject: "Week 38. Stock the freezer.", body: [
    "Week 38. Future you will thank present you for this one.",
    "Your one thing this week: cook and freeze a few easy meals. Or line up who is bringing food the first two weeks.",
    "Nobody has the energy to cook with a newborn. Feed your family ahead of time.",
  ]},
  { week: 39, subject: "Week 39. Any day now.", body: [
    "Week 39. Any day now.",
    "Your one thing this week: be reachable. Phone charged, volume on, gas in the car. And be present with her. She is uncomfortable, tired, and probably a little scared.",
    "So are you. That is normal. Tell her you're ready. Say it out loud.",
  ]},
  { week: 40, subject: "Week 40. You've got this.", body: [
    "Week 40. Due date week. Plenty of babies come early, and plenty come late. Both are normal.",
    "Your one thing this week: stay steady. Be the same guy every time you walk through the door. That is the best gift you can give your family right now.",
    "When the baby is here, hit reply and tell us. We mean it. We want to hear.",
  ]},
];
