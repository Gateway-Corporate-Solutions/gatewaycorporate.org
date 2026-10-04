---
title: The Age of Generalized Biometrics Software
slug: the-age-of-generalized-biometrics-software
date: 2026-10-04
author: Sam Roux
excerpt: Devicer NEXT extends device comparison toward biometrics and embedded electronics, with new prototypes and a research proposal for blood-based authentication.
tags: [devicer, biometrics, identity, security, technology]
---

A browser changes after an update. A handwritten signature changes between signings. A sensor produces slightly different readings of the same object. In each case, exact equality can answer the wrong question: the records are different, but does that difference matter?

Much of my work on Devicer has been about that gap between identical data and meaningful correspondence. Devicer 2 approached it through digital device fingerprints: collections of browser and device attributes, not the ridge patterns on a person's finger. Devicer NEXT expands the scope to problems where datasets must be compared in more complex, domain-specific ways.

Biometrics is an especially interesting application, but the opportunity extends beyond identity. Manufacturers, laboratory teams, and federal technical evaluators all encounter noisy measurements that must be compared with a reference. The question is how much of the software supporting those decisions can be reused without pretending that the underlying evidence is interchangeable.

## From device fingerprints to a broader comparison framework

With Devicer 2, the practical problem was recognizing relationships between observations despite missing fields, changing attributes, and unequal evidentiary value. A field that changes frequently should not necessarily outweigh several more durable signals. Equally, a common attribute should not acquire importance simply because it is easy to collect.

I previously discussed that work in [Building & Beating Advanced Digital Fingerprinting Systems](/blog/building-and-beating-advanced-digital-fingerprinting-systems). NEXT carries the comparison problem into a broader architecture: more extensive plugins, additional comparison methods, and domain-specific ways to represent and evaluate advanced datasets.

The important distinction is between generalizing the framework and generalizing the conclusion. A fingerprint sensor, signature scanner, and laboratory instrument do not produce interchangeable inputs. Each needs appropriate acquisition, feature extraction, and comparison semantics. What can be shared is the surrounding machinery: versioned observations, explicit missingness and quality, configurable comparisons, reproducible evaluation, and evidence that an application can inspect before making a decision.

That also separates similarity from authority. A comparison result should explain the available evidence; the application decides what that evidence permits. A score is not automatically an identity probability, and it should not become an authorization merely because it crosses an arbitrary threshold.

For a manufacturer, this separation could make it easier to evaluate a different sensor or comparison method without rebuilding the entire surrounding application. It does not remove the need to establish that the replacement works.

## Rust, embedded systems, and the new examples

Another major direction is a backward-compatible Rust port, intended to make Devicer's comparison work available in embedded electronics systems. Compatibility matters because expanding the implementation should not casually invalidate existing integrations or change their comparison behavior.

There is a distinction between that destination and the current public release evidence. The [public NEXT branch](https://github.com/gatewaycorporate/fp-devicer/tree/NEXT) documents Rust scorer and hashing work, a native bridge, and compatibility checks. Its [pinned architecture notes](https://github.com/gatewaycorporate/fp-devicer/blob/3dd7b66360b6a020e74d82a0e631ee9c9904be8a/docs/next/architecture.md) still describe limited supported scope and open release gates. They do not establish a complete Rust-backed replacement on every target.

In newer, unpublished work, I have also written a Rust signature-verification example for a USB signature scanner and a TypeScript example for physical fingerprint scanning and identification. These prototypes explore how the expanded comparison approach can be used outside browser fingerprinting. Handwritten signature verification here means comparing captured handwriting, not verifying a cryptographic digital signature.

The examples are not commercial accuracy claims or evidence of qualification across scanner models. Their value at this stage is making integration ideas concrete enough to inspect and develop. A manufacturer still needs target-specific measurements, supported device interfaces, and a clear account of failure behavior.

Rust is part of the deployment strategy, not a substitute for that work. Execution time, memory use, power consumption, hardware interfaces, and update mechanisms have to be evaluated on the intended electronics. I would rather describe those deliverables individually than attach a single completion percentage to very different products.

## A research case study: molecular identity for secure storage

One application I have begun developing into a manufacturer partnership proposal is a biometric gun safe that compares a fresh fingerstick blood sample with an enrolled owner profile. This concerns access to secure storage, not a firearm firing mechanism. The design objective is opening the safe within ten seconds of the initial sampling interaction, without whole-genome analysis.

That is a research target, not an achieved specification. It includes obtaining the sample, sensing it, evaluating the evidence, and confirming physical release. A fast comparison algorithm alone cannot demonstrate a fast product.

The proposal investigates selected molecular measurements rather than assuming that ordinary blood typing establishes identity. Published research supplies reasons to investigate: [Hertaeg and colleagues](https://doi.org/10.1039/D0AN01896A) report a rapid paper-based blood-typing method, while [Dakup and colleagues](https://doi.org/10.1021/acs.jproteome.5c00928) describe targeted measurement of inherited protein variants in plasma. These are different experimental systems. Neither establishes the proposed safe's owner-recognition performance or complete interaction time.

The unresolved question is whether a compact measurement system can provide enough repeatable, discriminating information inside the available time. A fast panel that places many people in the same category is insufficient. A highly discriminating laboratory measurement that takes too long also misses the product objective. No optimized blood-marker panel or production sensor is being announced here.

The proposed responsibilities are deliberately separate. The sampling subsystem supplies measurements and quality information. A blood-specific Devicer adapter would represent and compare those observations. The manufacturer's controller would retain authority over enrollment, timing, and access. A matching sample alone does not establish that its owner is present and intentionally requesting entry.

Practical constraints are substantial. Evaluation must include repeated samples, relatives, incomplete evidence, and changes over time; lifelong enrollment cannot be inferred from inherited biology. Sampling also introduces discomfort, consumables, contamination control, and disposal. [CDC guidance](https://www.cdc.gov/injection-safety/hcp/infection-control/index.html) warns against sharing fingerstick devices. Human-use development needs qualified safety oversight and a sterile, single-use sampling interface, not an assumption that treating a used tip makes reuse safe.

The immediate opportunity is a bounded feasibility engagement with a manufacturer and qualified laboratory. It must be possible to conclude that the sensing, usability, or cost requirements cannot be met. Devicer supplies a software starting point for that investigation, not proof that the biological product will work.

## Where else could this matter?

The strongest opportunities are not simply industries with large datasets. They are settings where ordinary equality checks lose useful relationships, while an unexplained similarity score is not enough to justify a decision. The following are potential applications, not announced integrations or claims of customer adoption.

### Biometric hardware and access control

Fingerprint readers, signature devices, and multimodal authentication systems are the closest fit to the new examples. Manufacturers could use a common comparison and evaluation framework while retaining sensor-specific extraction and security policy. The benefit would be reusable integration work, not a promise that one matcher performs equally well across modalities. Enrollment integrity, presentation defenses, and complete-device testing remain necessary.

### Document and transaction workflows

Captured handwritten signatures could be compared with authorized references during document intake or approval workflows. This creates a possible role in financial services, insurance, and administrative systems. However, ordinary variation and skilled imitation both need evaluation. A handwriting match is neither cryptographic proof nor, by itself, proof of legal authorization. Its appropriate role depends on the surrounding workflow and other evidence.

### Industrial inspection and quality assurance

A manufactured part can differ from a reference without being defective, while a small difference in a critical measurement can matter greatly. Comparing structured inspection features from cameras or other sensors is a plausible extension of domain-specific comparison. Such a project would need suitable feature extraction, production data, and labelled defects. NEXT should not be mistaken for a ready-made machine-vision model or inspection certification.

### Energy, transport, and equipment maintenance

Vibration, acoustic, thermal, and telemetry records may help distinguish ordinary operating variation from an emerging fault. A comparison framework could support evaluating observations against condition-specific baselines or known examples. This is an adjacent research opportunity, not an existing predictive-maintenance product. Temporal alignment, changing loads, sensor calibration, and validated failure examples would determine whether the comparisons are useful.

### Laboratory and specimen workflows

Profile comparison could support investigations of specimen consistency or continuity between collection events. That is related to, but different from, recognizing a person or diagnosing a condition. The comparison would need laboratory validation and independent chain-of-custody controls. Reusing software does not transfer a validation result between assays, and access to a sample does not automatically authorize every inference its measurements might support.

### Federal technical evaluation and forensic research

Federal laboratories and technical teams may have reasons to investigate controlled identity verification, reference comparison in forensic workflows, or relationships among heterogeneous sensor observations. The attraction would be inspectable, reproducible comparisons with explicit limitations. These are potential evaluation settings, not agency endorsements or deployment claims. Operational and evidentiary use would require lawful authority, provenance, relevant error studies, and qualified human interpretation; a high score cannot independently establish attribution.

## What makes the software commercially credible?

For any of these applications, the first step is to define the relationship being tested. "Same person," "consistent specimen," "acceptable part," and "similar equipment condition" are different claims. Their ground truth, tolerance for error, and consequences of failure are also different.

The next step is evaluation that does not quietly reuse the answer. Feature development, calibration, and final testing need appropriate separation. Repeated observations from the same small group do not become independent evidence simply because software generates many pairwise comparisons. Where uncertainty remains too high, the system needs a meaningful way to abstain.

Manufacturers also need the failures that disappear from headline accuracy figures: unavailable samples, failed enrollment, retries, timeouts, and performance outside ideal conditions. Embedded deployment adds target-specific resource limits and behavior during reset, low power, or interrupted updates. Those are product requirements, not packaging details to postpone until after a demonstration.

Privacy belongs in the same conversation. Biological profiles and persistent identifiers can remain sensitive even without a person's name attached. The intended use should determine collection authority, minimum retained information, access controls, and deletion. Security-only authentication should not quietly become health inference or a broader identification database.

For forensic settings, reproducible processing and traceable configuration are necessary but not sufficient. Chain of custody, interpretation, and the limits of the comparison must remain visible. For commercial electronics, an independent review of the integrated product is similarly distinct from a passing library test suite.

## The next step is a specific problem

The direction I am pursuing with NEXT is broader than another biometric reader. It is a reusable software foundation for cases where deciding what two observations mean in relation to each other requires more than exact matching.

The new prototypes make that direction tangible. The molecular-identity proposal tests it against a particularly demanding combination of sensing, timing, safety, and commercial constraints. Other industries may present less invasive and more immediately practical applications, but they deserve equally specific evaluation.

For manufacturers, laboratories, and federal technical teams interested in exploring that fit, a useful starting conversation is concrete: what observations are available, what relationship must be established, what errors are tolerable, and where must the software run? Those answers can define a paid feasibility engagement or a development partnership with measurable deliverables and a clear stop decision.

The existing [Devicer product overview](/products/devicer) provides background on the device-intelligence work. To discuss a domain-specific evaluation of NEXT, [contact Gateway Corporate](/contact). The opportunity is to turn a well-defined comparison problem into evidence that a product team can actually use.

