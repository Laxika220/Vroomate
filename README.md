> **New: Vroomate web app.** A mobile-first Lavasa ↔ Pune carpool and travel-buddy marketplace now lives in [`web/`](web/README.md) (Node 22, no npm dependencies). The Android app below is unchanged.

## Vroomate(scroll down for pictures and video)

**Cab Share** is a simple Android app that helps students **find ride partners** and **split transportation costs**. It's designed to make commuting between **Christ University Lavasa Campus and Pune** easier and more affordable.

---

## Features

- Match with verified students going the same route
- Live feed of available rides
- Smart matching based on **time** and **route**
- Simple, swipe-based interface (Tinder-style) for browsing rides
- Create a ride with departure date/time, meeting point, seats available, and gender preference
- Sign in with **name** and **college email**

---

## Tech Stack

- **Language:** Kotlin
- **UI:** Jetpack Compose (Material 3)
- **Navigation:** Jetpack Navigation Compose
- **Backend:** Firebase Authentication + Cloud Firestore
- **Async:** Kotlin Coroutines (with `kotlinx-coroutines-play-services` for `Task.await()`)
- **Build system:** Gradle (Kotlin DSL)

**Minimum SDK:** 24  |  **Target/Compile SDK:** 36

---


### App Flow

1. **Login** — user enters name and college email
2. **Swipe** — browse a live feed of available rides and swipe to match
3. **Create Ride** — post a new ride with route, date/time, venue, seats, and gender preference

---

## Getting Started

### Prerequisites

- [Android Studio](https://developer.android.com/studio) (recent stable version)
- JDK 11
- A Firebase project with **Authentication** and **Cloud Firestore** enabled

### Setup

1. **Clone the repo**
   \```bash
   git clone https://github.com/Laxika220/cabSharing.git
   cd cabSharing
   \```

2. **Firebase config**
   The app expects a `google-services.json` file in the `app/` directory, generated from your own Firebase project (register an Android app with package name `com.example.cabsharing`). This file is required for Auth and Firestore to work.

3. **Open in Android Studio**
   Open the project root and let Gradle sync.

4. **Run**
   Build and run on an emulator or device (minSdk 24+), or from the command line:
   \```bash
   ./gradlew assembleDebug
   \```

---

## Permissions

- `INTERNET` — required for Firebase Authentication and Firestore sync

---

## Roadmap / Ideas

- [ ] Push notifications on match
- [ ] In-app chat between matched riders
- [ ] Ride history
- [ ] Report/verify system for user safety

---



https://github.com/user-attachments/assets/32fe540c-2acf-4592-9320-81e00b60eb86



<img width="1080" height="2400" alt="1787407987980" src="https://github.com/user-attachments/assets/d091ba69-41e2-4119-b210-69504ce2551b" />
<img width="1080" height="2400" alt="1787407987991" src="https://github.com/user-attachments/assets/1f5b168b-be01-46c6-8ebe-55487e0d6356" />
