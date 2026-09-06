// ============================================================
//  STUDY PORTAL — CONFIGURATION
//  Edit this file to change site content & Google Form settings
// ============================================================

const SITE_CONFIG = {

  // ── Site Metadata ──────────────────────────────────────────
  title: "Class 12 Study Portal",
  subtitle: "Complete study material — Notes, Formulas & Solutions",

  // ── Formspree (Visitor Logging) ─────────────────────────────
  //  Every time someone types their name on the gate and hits
  //  Continue, their name is POSTed here in the background —
  //  Formspree emails you a notification with who just logged in.
  //  Note: Formspree checks the sending domain against the one
  //  registered on your form at formspree.io — if you serve this
  //  site from a different host later, add that host in your
  //  Formspree dashboard or submissions will be blocked silently.
  formspree: {
    endpoint: "https://formspree.io/f/moeqnqrq",
  },

  // ── Access List (Who Can Log In) ─────────────────────────────
  //  Only names on this list can get past the gate. Matching is
  //  case-insensitive and ignores extra spaces — "PRIYA", "priya",
  //  "  Priya " all match "Priya". Put whichever version of a
  //  name a student is likely to type: their first name, their
  //  full name, or both as separate entries (safest — covers
  //  either way they might type it). Set enabled: false to open
  //  the gate back up to anyone.
  accessList: {
    enabled: true,
    names: [
      // TODO: replace with your actual student list
      "Aarav", "Ishaan", "Priya", "Zoya",
      "Aarav Shah", "Ishaan Mehta", "Priya Patel", "Zoya Sheikh",
    ],
  },

  // ── Subjects & Files ──────────────────────────────────────
  subjects: [

    // ═══════════════════════  MATHEMATICS  ═══════════════════════
    {
      id: "maths",
      name: "Mathematics",
      icon: "📐",
      color: "#8fa07b",
      subfolders: [
        {
          id: "maths-notes",
          name: "Maths Notes",
          files: [
            { name: "1. Relations and Functions Notes", path: "maths/Maths Notes/1.Relations and Functions Notes.pdf" },
            { name: "2. Inverse Trigonometric Functions Notes", path: "maths/Maths Notes/2.Inverse Trignometric Functions Notes.pdf" },
            { name: "3. Matrices Notes", path: "maths/Maths Notes/3.Matrices Notes.pdf" },
            { name: "4. Determinants Notes", path: "maths/Maths Notes/4.Determinants Notes.pdf" },
            { name: "5. Differentiability & Continuity Notes", path: "maths/Maths Notes/5.Differentiability & Continuity Notes.pdf" },
            { name: "6. Applications of Derivatives Notes", path: "maths/Maths Notes/6.Apllications of derivatives Notes.pdf" },
            { name: "7. Integrals Notes", path: "maths/Maths Notes/7.Integrals Notes.pdf" },
            { name: "8. Applications of Integrals Notes", path: "maths/Maths Notes/8.Applications of Integrals Notes.pdf" },
            { name: "9. Differential Equations Notes", path: "maths/Maths Notes/9.Differential Equations Notes.pdf" },
            { name: "10. Vector Algebra Notes", path: "maths/Maths Notes/10.Vector Algebra Notes.pdf" },
            { name: "11. Three Dimensional Geometry Notes", path: "maths/Maths Notes/11.Three Dimensional Geometry Notes.pdf" },
            { name: "12. Linear Programming Notes", path: "maths/Maths Notes/12.Linear Programming Notes.pdf" },
            { name: "13. Probability Notes", path: "maths/Maths Notes/13.Probability Notes.pdf" },
          ]
        },
        {
          id: "maths-formulas",
          name: "Maths Formulas",
          files: [
            { name: "1. Relations & Functions Formulas", path: "maths/Maths Formulas/1.Relations & Functions Formulas.pdf" },
            { name: "2. Inverse Trigonometric Functions Formulas", path: "maths/Maths Formulas/2.Inverse Trignometric Functions Formulas.pdf" },
            { name: "3. Matrices Formulas", path: "maths/Maths Formulas/3.Matrices Formulas.pdf" },
            { name: "4. Determinants Formulas", path: "maths/Maths Formulas/4.Determinants Formulas.pdf" },
            { name: "5. Differentiability and Continuity Formulas", path: "maths/Maths Formulas/5.Differentiability and Continuity Formulas.pdf" },
            { name: "6. Applications of Derivatives Formulas", path: "maths/Maths Formulas/6.Applications of Derivatives Formulas.pdf" },
            { name: "7. Integrals Formulas", path: "maths/Maths Formulas/7.Integrals Formulas.pdf" },
            { name: "8. Applications of Integrals Formulas", path: "maths/Maths Formulas/8.Applications Of Integrals Formulas.pdf" },
            { name: "Formula List — Chapter 1 to 8", path: "maths/Maths Formulas/Formula List Chapter 1 to 8.pdf" },
          ]
        },
        {
          id: "maths-solutions",
          name: "Maths Solutions",
          files: [
            { name: "1. Relations & Functions", path: "maths/Maths Solutions/1.Relations & Functions.pdf" },
            { name: "2. Inverse Trigonometric Functions", path: "maths/Maths Solutions/2.Inverse Trignometric Functions.pdf" },
            { name: "3. Matrices", path: "maths/Maths Solutions/3.Matrices.pdf" },
            { name: "4. Determinants", path: "maths/Maths Solutions/4.Determinants.pdf" },
            { name: "5. Continuity & Differentiability", path: "maths/Maths Solutions/5.Continuity & Differentiabilty.pdf" },
            { name: "6. Applications of Derivatives", path: "maths/Maths Solutions/6.Applications of Derivatives.pdf" },
            { name: "7. Integrals", path: "maths/Maths Solutions/7.Integrals.pdf" },
            { name: "8. Applications of Integrals", path: "maths/Maths Solutions/8.Applications of Integrals.pdf" },
            { name: "9. Differential Equations", path: "maths/Maths Solutions/9.Differential Equations.pdf" },
            { name: "10. Vector Algebra", path: "maths/Maths Solutions/10.Vector Algebra.pdf" },
            { name: "11. Three Dimensional Geometry", path: "maths/Maths Solutions/11.Three Dimensional Geometry.pdf" },
            { name: "12. Linear Programming", path: "maths/Maths Solutions/12.Linear Programming.pdf" },
            { name: "13. Probability", path: "maths/Maths Solutions/13.Probability.pdf" },
            { name: "Volume 1 (Complete)", path: "maths/Maths Solutions/Volume 1.pdf" },
            { name: "Volume 2 (Complete)", path: "maths/Maths Solutions/Volume 2.pdf" },
          ]
        },
      ]
    },

    // ═══════════════════════  PHYSICS  ═══════════════════════
    {
      id: "physics",
      name: "Physics",
      icon: "⚛️",
      color: "#6f93ab",
      subfolders: [
        {
          id: "physics-notes",
          name: "Chapter Notes",
          files: [
            { name: "Ch 1 — Electric Charges and Fields", path: "physics/Chapter Notes/Chapter 1 - Electric Charges and Fields.pdf" },
            { name: "Ch 2 — Electrostatic Potential & Energy", path: "physics/Chapter Notes/Chapter 2 - Electrostatic Potential Ener.pdf" },
            { name: "Ch 3 — Electric Resistance and Ohm's Law", path: "physics/Chapter Notes/Chapter 3 - Electric Resistance and Ohms.pdf" },
            { name: "Ch 4 — Moving Charges and Magnetism", path: "physics/Chapter Notes/Chapter 4 - Moving Charges and Magnetism.pdf" },
            { name: "Ch 5 — Magnetism and Matter", path: "physics/Chapter Notes/Chapter 5 - Magnetism and Matter.pdf" },
            { name: "Ch 6 — Electromagnetic Induction", path: "physics/Chapter Notes/Chapter 6 - Electromagnetic Induction.pdf" },
            { name: "Ch 7 — Alternating Current", path: "physics/Chapter Notes/Chapter 7 - Alternating Current.pdf" },
            { name: "Ch 8 — Electromagnetic Waves", path: "physics/Chapter Notes/Chapter 8 - Electromagnetic Waves.pdf" },
            { name: "Ch 9 — Ray Optics & Optical Instruments", path: "physics/Chapter Notes/Chapter 9 - Ray Optics & Optical Instrum(1).pdf" },
          ]
        },
        {
          id: "physics-formulas",
          name: "Physics Formulas",
          files: [
            { name: "01. Electric Fields and Charges Formulas", path: "physics/Physics Formulas/01. Electric Fields and Charges Formulas.pdf" },
            { name: "02. Electrostatic Potential Formulas", path: "physics/Physics Formulas/02. Electrostatic Potential Formulas.pdf" },
            { name: "03. Electric Resistance and Ohm's Law Formulas", path: "physics/Physics Formulas/03. Electric Resistance and Ohms Law Formulas.pdf" },
            { name: "04. Moving Charges and Magnetism Formulas", path: "physics/Physics Formulas/04. Moving Charges and Magnetism Formulas.pdf" },
            { name: "05. Magnetism and Matter Formulas", path: "physics/Physics Formulas/05. Magnetism and Matter Formulas.pdf" },
            { name: "06. Electromagnetic Induction Formulas", path: "physics/Physics Formulas/06. Electromagnetic Induction Formulas.pdf" },
            { name: "07. Alternating Current Formulas", path: "physics/Physics Formulas/07. Alternating Current Formulas.pdf" },
            { name: "08. Electromagnetic Waves Formulas", path: "physics/Physics Formulas/08. Electromagnetic Waves Formulas.pdf" },
            { name: "09. Ray Optics and Optical Instruments Formulas", path: "physics/Physics Formulas/09. Ray Optics and Optical Instruments Formulas.pdf" },
            { name: "10. Wave Optics Formulas", path: "physics/Physics Formulas/10. Wave Optics Formulas.pdf" },
            { name: "11. Dual Nature of Radiation and Matter Formulas", path: "physics/Physics Formulas/11. Dual Nature of Radiation and Matter Formulas.pdf" },
            { name: "12. Atoms Formulas", path: "physics/Physics Formulas/12. Atoms Formulas.pdf" },
            { name: "13. Nuclei Formulas", path: "physics/Physics Formulas/13. Nuclei Formulas.pdf" },
            { name: "14. Semiconductor Electronics Formulas", path: "physics/Physics Formulas/14. Semiconductor Electronics Formulas.pdf" },
            { name: "Physics Formulas — Ch 1 to 14 (Complete)", path: "physics/Physics Formulas/Physics_Formulas_Ch1-14.pdf" },
          ]
        },
        {
          id: "physics-solutions",
          name: "Physics Solutions",
          files: [
            { name: "1. Electric Fields and Charges", path: "physics/Physics Solutions/1.Electric Fields and charges.pdf" },
            { name: "2. Electrostatic Potential", path: "physics/Physics Solutions/2.Electrostatic Potential.pdf" },
            { name: "3. Electric Resistance and Ohm's Law", path: "physics/Physics Solutions/3.Electric Resistance and Ohms Law.pdf" },
            { name: "4. Moving Charges and Magnetism", path: "physics/Physics Solutions/4.Moving Charges and Magnetism.pdf" },
            { name: "5. Magnetism and Matter", path: "physics/Physics Solutions/5.Magnetism and Matter.pdf" },
            { name: "6. Electromagnetic Induction", path: "physics/Physics Solutions/6.Electromagnetic Induction.pdf" },
            { name: "7. Alternating Current", path: "physics/Physics Solutions/7.Alternating Current.pdf" },
            { name: "8. Electromagnetic Waves", path: "physics/Physics Solutions/8.Electromagnetic Waves.pdf" },
            { name: "9. Ray Optics and Optical Instruments", path: "physics/Physics Solutions/9.Ray Optics and Optical Instruments.pdf" },
            { name: "10. Wave Optics", path: "physics/Physics Solutions/10.Wave Optics.pdf" },
            { name: "11. Dual Nature and Radiation of Matter", path: "physics/Physics Solutions/11.Dual Nature and Radiation of Matter.pdf" },
            { name: "12. Atoms", path: "physics/Physics Solutions/12.Atoms.pdf" },
            { name: "13. Nuclei", path: "physics/Physics Solutions/13.Nuclei.pdf" },
            { name: "14. Semiconductor Electronics", path: "physics/Physics Solutions/14.Semiconductor Electronics.pdf" },
            { name: "Volume 1 (Complete)", path: "physics/Physics Solutions/Volume 1.pdf" },
            { name: "Volume 2 (Complete)", path: "physics/Physics Solutions/Volume 2.pdf" },
          ]
        },
      ]
    },

    // ═══════════════════════  CHEMISTRY  ═══════════════════════
    {
      id: "chemistry",
      name: "Chemistry",
      icon: "🧪",
      color: "#b06349",
      subfolders: [
        {
          id: "chemistry-notes",
          name: "Chapter Notes",
          files: [
            { name: "Ch 1 — Solutions", path: "chemistry/Chapter Notes/Chapter 1 - Solutions.pdf" },
            { name: "Ch 2 — Electrochemistry", path: "chemistry/Chapter Notes/Chapter 2 - Electrochemistry.pdf" },
            { name: "Ch 3 — Chemical Kinetics", path: "chemistry/Chapter Notes/Chapter 3 - Chemical Kinetics.pdf" },
            { name: "Ch 4 — D & F Block Elements", path: "chemistry/Chapter Notes/Chapter 4 - D & F Block Elements.pdf" },
            { name: "Ch 6 — Haloalkanes & Haloarenes", path: "chemistry/Chapter Notes/Chapter 6 - Haloalkanes & Haloarenes.pdf" },
            { name: "Ch 7 — Alcohols, Phenols & Ethers", path: "chemistry/Chapter Notes/Chapter 7 - Alcohols Phenols & Ethers.pdf" },
            { name: "Ch 10 — Biomolecules", path: "chemistry/Chapter Notes/Chapter 10 - Biomolecules.pdf" },
          ]
        },
      ]
    },
  ]
};
