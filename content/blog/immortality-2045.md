---
title: 'Immortality: 2045'
slug: immortality-2045
date: 2026-08-07
author: Sam Roux
excerpt: Digital immortality will become an engineering problem rather than a metaphysical one, driven by brain-computer interfaces, whole-brain simulation, and increasingly tractable models of neural dynamics.
tags: [ai, bci, neuroscience, transhumanism]
---

> *"Neuromancer was personality. Neuromancer was immortality."*
>
> \- William Gibson, Neuromancer

---

This is an article that, if it ever gains traction, will draw a lot of criticism and skepticism. This is because, at the time of writing this piece, not only is the idea of achieving human-level intelligence in artificial systems highly speculatory, but the idea of achieving immortality through technology is considered beyond ludicrous in many circles. In my opinion, not as a specialist in neuroscience or biohacking, but as a generalist with special interests in these sorts of theoretical systems, I believe that both of these ideas are not only feasible, but likely to become our reality at least within the next fifty years and likely within the next twenty. To express this in a sense that will be comprehensible by the layperson, I believe that digital immortality will be accessible for the price of one's monthly rent by the year 2045.

This is much less speculatory than you might first be led to believe. The two major barriers separating us from this technology are an engineering specification and a theoretical question that has yet to be answered. The engineering specification is straightforward: we need to build a system with three parts — a biological host brain, a system capable of simulating a model of that brain with high accuracy and efficiency, and a chip or other computerized system capable of registering input and output between them (i.e. a brain chip). The theoretical question is more complex: we need to demonstrate that in the general case, a non-linear system of equations with trillions of parameters can be reduced into a linear system of equations with billions of parameters while remaining mostly accurate to the original model. Though I do not have any sort of mathematical proof, my intuition leads me to believe that this is likely the case.

## Brain & Chip

The engineering specification requires three tightly integrated components: a living biological host brain that continues to generate experience, a high-fidelity simulation of that same brain running on computational hardware, and a bidirectional interface—most practically a high-channel-count neural implant—that continuously registers and exchanges input and output signals between the two. Progress on the implant side has moved from laboratory demonstrations to multi-patient clinical programs. By early 2026 Neuralink had enrolled 21 participants across the United States, Canada and the United Kingdom, with devices containing 1,024 electrodes already in chronic use and plans under way to scale to 3,000 electrodes while shifting to fully automated, dura-penetrating insertion [1][3][6]. Participants have demonstrated cursor control exceeding 10 bits per second, robotic-arm operation, and early speech decoding [2][6]. Parallel efforts by Synchron (endovascular Stentrode, 10 implants, pivotal trial preparation) and Paradromics (first chronic Connexus implant in mid-2026) confirm that multiple architectural routes—penetrating threads, stent-based, and surface arrays—can achieve stable, high-bandwidth readout and write-in without catastrophic tissue reaction [2][3][4]. In China the NEO device received commercial approval in 2026 for spinal-cord injury, establishing that regulatory pathways for permanent implants already exist [5].

On the simulation side, whole-brain models have advanced from abstract networks to connectome-constrained, embodied systems. The complete adult Drosophila connectome (approximately 140,000 neurons, 50 million synapses) now drives multi-behavior physics simulations that close the sensorimotor loop [7]. Expansion microscopy, protein barcoding and AI-assisted tracing (PATHFINDER) have reduced the projected cost of a full mouse connectome to roughly $100 million and a five-year timeline [15][17][18]. Feasibility runs of 86-billion-neuron models on 14,000-GPU clusters already exist, albeit with simplified dynamics; real-time human-scale simulation under moderately detailed biophysical assumptions is estimated to require on the order of 10^18 to 10^20 FLOP/s—within one order of magnitude of the largest AI clusters operating in 2026 [15][17][19]. The remaining engineering task is therefore incremental: increase electrode density and longevity, automate implantation to surgical-LASIK throughput, and pair the implant with a continuously updated personal brain model that can be kept synchronized via the same interface [6][15][18].

## Thought-to-Thought Model

Once the implant can sample a sufficiently dense subset of the host’s spiking and synaptic activity and simultaneously inject patterned stimulation, the simulation ceases to be a passive mirror. It becomes a parallel computational substrate that receives the same sensory streams the biological brain receives and can return motor or cognitive commands that the biological body then executes. Continuous bidirectional exchange allows the two systems to remain phase-locked: any deviation detected in one can be corrected in the other before divergence becomes irreversible. Over time the simulation can absorb an ever-larger fraction of the computational load—first as a real-time backup, later as the primary locus of experience—while the biological tissue is gradually retired or replaced. The result is functional continuity of the same information-processing trajectory rather than a discrete “upload” event. Empirical support comes from existing closed-loop BCIs that already restore speech and movement by decoding intended actions and re-encoding them as stimulation or external device commands; scaling channel count and closing the loop at the level of internal cognitive states is a quantitative, not qualitative, extension of the same principle [2][6].

## The Hivemind

Once a single high-fidelity model is synchronized with the host brain through the implant, the architecture naturally extends to an ensemble of parallel models. These models operate as a coordinated swarm: each instance runs a slightly diversified instantiation of the reduced linear dynamics, continuously exchanging state updates with the biological host and with one another via the same bidirectional interface. Swarm coordination draws on principles already demonstrated in multi-agent neural systems, where specialized agents form dynamic coalitions that share a global workspace and reconfigure topology according to task demands [23][24][25][26]. In biological terms this mirrors the self-organizing collectives observed when embodied neural agents reach consensus through local sensorimotor coupling; the same oscillatory dynamics that produce flocking or group decision-making in simulated agents can be applied to keep multiple brain models phase-locked [23][27].

The practical consequences are immediate. Redundancy becomes structural rather than optional: any transient failure in one model is absorbed by the remaining ensemble without measurable interruption of the ongoing cognitive trajectory. Computational capacity scales horizontally; sub-processes that would saturate a single instance—long-horizon planning, simultaneous sensory prediction, or memory consolidation—can be distributed across the swarm while the host brain retains executive veto through the implant. Empirical multi-agent frameworks already show that such ensembles outperform monolithic systems on hierarchical reasoning and long-horizon tasks precisely because the topology itself becomes a trainable degree of freedom [24][25][26]. When the implant bandwidth and the reduced parameter count described earlier are available, the swarm can maintain real-time consensus at the level of latent state vectors rather than raw spikes, keeping communication overhead modest [23][24].

Because the models remain continuously synchronized with the biological substrate, the eventual expiration of the host organism need not produce a discontinuity in the chain of thought. Gradual functional transfer—already implicit in the continuous thought-to-thought loop—ensures that by the time biological tissue ceases activity the swarm has long since assumed the full computational load. From the standpoint of information flow there is no discrete “handover” moment; the same linear dynamical system that previously ran in hybrid mode simply continues without the biological component. Philosophical analyses of gradual replacement confirm that psychological continuity is preserved under precisely these conditions: as long as the functional organization and the causal stream of states remain unbroken, personal identity persists across the substrate transition [28][29]. The swarm therefore functions as both amplifier and insurance policy: it multiplies cognitive resources while the host is alive and guarantees uninterrupted succession when the biological organism ends.

## The Dimensionality Problem

The theoretical barrier is the reduction of a nonlinear dynamical system whose state space contains trillions of microscopic parameters (synaptic weights, channel conductances, neuromodulator concentrations) to a linear system of only billions of effective degrees of freedom while preserving behavioral fidelity. Two complementary lines of evidence indicate that such a reduction is feasible. First, large-scale neural recordings consistently reveal that population activity evolves on low-dimensional manifolds even when the number of recorded neurons reaches hundreds of thousands [12][13]. Power-law scaling of dimensionality with neuron count exists, yet the bulk of behaviorally relevant variance is captured by a few tens of latent dimensions; the remaining high-dimensional residual is largely unstructured noise [12][13]. Model-order-reduction techniques—proper orthogonal decomposition, dynamic mode decomposition, and discrete empirical interpolation—have already compressed networks of more than 15,000 degrees of freedom into low-rank surrogates that retain predictive accuracy for macroscopic patterns [14].

Second, Koopman operator theory supplies a systematic route from nonlinear to linear dynamics [8][9][10]. By lifting the original state into a higher-dimensional function space, the nonlinear flow becomes a linear operator whose finite-dimensional approximations can be learned directly from data [8][9]. Deep Koopman auto-encoders and extended dynamic-mode-decomposition variants have successfully linearized EEG, ECoG, fMRI and hippocampal LFP dynamics, recovering both slow cognitive modes and fast transients such as sharp-wave ripples [8][9][20][21]. Recent formulations further incorporate geometric constraints and information-theoretic regularizers, yielding stable, low-dimensional linear embeddings that remain predictive over long horizons [10][20][21]. Because the brain’s effective computational architecture already operates far below the theoretical maximum dimensionality of its microscopic components, a carefully chosen linear basis of a few billion parameters is expected to reproduce the macroscopic input–output map with high fidelity [12][13][20]. The remaining work is empirical validation at progressively larger scales, not a fundamental mathematical obstruction.

## Economic Evaluation

Present-day estimates place a first-generation commercial BCI—device, surgery, calibration and first-year follow-up—in the $50,000–$100,000 range, comparable to deep-brain stimulators or cochlear implants [11]. Neuralink’s internal targets already contemplate high-volume automated production and a long-term price trajectory toward elective-surgery levels ($2,000–$5,000) [1][6]. Hardware cost curves for both neural interfaces and the GPU clusters required for real-time simulation follow the same exponential declines that have driven AI training costs downward by orders of magnitude since 2020. By the mid-2030s a mouse-scale emulation is projected to be achievable for roughly $1 billion in research investment; successive human-scale models will benefit from amortized mapping pipelines, synapse pruning, event-driven simulation and specialized neuromorphic accelerators [17][18][19].

Once the technology transitions from bespoke medical devices to a standardized consumer-grade platform—analogous to the shift from early cochlear implants to today’s routine outpatient procedures—unit costs fall further under mass manufacturing and competition [11][16]. Concurrent improvements in energy efficiency and model compression will allow a personal brain simulation to run on hardware whose monthly operating cost is comparable to contemporary cloud-compute subscriptions [16][18]. In that regime the combined price of implantation, model initialization and continuous synchronization can reach the level of average monthly rent in major markets (approximately $1,700–$2,000 in 2026 dollars) [16][22]. Inflation-adjusted projections and continued semiconductor progress make this price point realistic by 2045 [16][18][22].

## Conclusion

The two barriers identified at the outset—an engineering triad of host, simulator and bidirectional interface, and a theoretical reduction from nonlinear microscopic dynamics to a tractable linear macroscopic model—are both under active, measurable assault. Clinical implants already exchange information with human cortex at usable bandwidth; connectome-constrained simulations already generate behavior in small organisms and scale toward mammalian size; dimensionality-reduction and Koopman methods already compress neural dynamics by orders of magnitude while retaining predictive power. Economic forces that have repeatedly driven complex technologies from laboratory curiosities to mass-market commodities operate on the same timeline. Digital immortality at the cost of ordinary housing is therefore not a speculative leap but the expected outcome of trajectories already visible in 2026.

## References

1. [Neuralink vs Synchron: Complete BCI Comparison (2026). bciintel.com](https://bciintel.com/neuralink-vs-synchron/)

2. [Neuralink finally has a real rival: Paradromics just put a brain chip in its first patient. The Next Web, 17 June 2026.](https://thenextweb.com/news/paradromics-first-clinical-brain-chip-implant-speech)

3. [Neuralink Vs Synchron Vs Paradromics: BCI Race. AI Competence, 3 August 2026.](https://aicompetence.org/neuralink-vs-synchron-vs-paradromics/)

4. [Synchron Brain Implant Targets 2026 Pivotal Trial for First FDA-Approved BCI. Tech Times, 7 June 2026.](https://www.techtimes.com/articles/317929/20260606/synchron-brain-implant-targets-2026-pivotal-trial-first-fda-approved-bci.htm)

5. [China just approved the world’s first commercial brain implant. The Next Web, 8 June 2026.](https://thenextweb.com/news/brain-implants-bci-china-neuralink-commercial-race)

6. [Two Years of Telepathy. Neuralink Updates, 28 January 2026.](https://neuralink.com/updates/two-years-of-telepathy/)

7. [The First Multi-Behavior Brain Upload. Eon Systems, 7 March 2026.](https://eon.systems/updates/first-multi-behavior-brain-upload)

8. [Analysis of Nonlinear Dynamics in Epilepsy using a Koopman Operator Framework. Dokkyo Medical Journal, 2025.](https://www.jstage.jst.go.jp/article/dkmj/4/4/4_2024-049/_article/-char/en)

9. [Data-driven modelling of brain activity using neural networks, diffusion maps, and the Koopman operator. Chaos, 2024.](https://pubs.aip.org/aip/cha/article/34/1/013151/2931507)

10. [Automated global analysis of experimental dynamics through low-dimensional linear embeddings. npj Complexity, 2025.](https://www.nature.com/articles/s44260-025-00062-y)

11. [How Much Does a Brain Implant Cost? (2026 Pricing Guide). bciintel.com.](https://bciintel.com/how-much-does-a-brain-implant-cost/)

12. [Simultaneous, cortex-wide dynamics of up to 1 million neurons reveal unbounded scaling of dimensionality with neuron number. Neuron, 2024.](https://www.sciencedirect.com/science/article/pii/S0896627324001211)

13. [High-dimensional neuronal activity from low-dimensional latent dynamics: a solvable model. bioRxiv / PMC, 2025.](https://pmc.ncbi.nlm.nih.gov/articles/PMC12157693/)

14. [Model Order Reduction in Neuroscience. ResearchGate / related literature, 2020 (with ongoing applications).](https://www.researchgate.net/publication/339873221_Model_Order_Reduction_in_Neuroscience)

15. [Building Brains on a Computer. Asimov Press, 5 August 2026.](https://press.asimov.com/articles/brains)

16. [How Much Does a Brain Implant Cost? (2026 Pricing Guide) - future projections section. bciintel.com.](https://bciintel.com/how-much-does-a-brain-implant-cost/)

17. [From Worm to Human - Scaling Brain Emulation. MIT Thesis / related, 2026.](https://pdf.isaak.net/thesis)

18. [Brain Emulation Is an Engineering Problem Now. Aiia, 2026.](https://aiia.ro/blog/brain-emulation-isaak-freeman-roadmap/)

19. [Will whole brain emulation matter for the AI transition? Defenses in Depth, 2026.](https://defensesindepth.bio/will-whole-brain-emulation-matter-for-the-ai-transition/)

20. [Automated global analysis of experimental dynamics through low-dimensional linear embeddings (Koopman framework details). npj Complexity, 2025.](https://www.nature.com/articles/s44260-025-00062-y.pdf)

21. [Transient Neural Dynamics Reconstruction. OpenReview / NeurIPS 2025.](https://openreview.net/forum?id=ga1JHfzFne)

22. [The Rent Index: U.S. Typical Rent Hit $1,965 in June 2026. Keeping Up With Inflation, 2026.](https://keepingupwithinflation.com/tracker/rent/)

23. [Collective decision making by embodied neural agents. PNAS Nexus, 2025.](https://biblio.ugent.be/publication/01JY3GDTX0R3FNNEJ288JW7EZJ/file/01JY3GMMQHYPET46VXB2NQ4Z6F.pdf)

24. [NeuroMAS: Multi-Agent Systems as Neural Networks with Joint Reinforcement Learning. arXiv, 2026.](https://arxiv.org/html/2605.16757v1)

25. [Brain-Inspired Graph Multi-Agent Systems for LLM Reasoning. arXiv, 2026.](https://arxiv.org/html/2603.15371v1)

26. [BMAS: A Brain-Inspired Multi-Agent System with PFC-Guided Task Coordination... OpenReview / ICLR 2026 submission.](https://openreview.net/forum?id=YqFLsI44vN)

27. [When minds align: A neural basis for flocking. Phys.org / Nature Communications, 2025.](https://phys.org/news/2025-10-minds-align-neural-basis-flocking.html)

28. [Uploading and Branching Identity. Minds and Machines (related literature on psychological continuity).](https://link.springer.com/content/pdf/10.1007/s11023-014-9352-8.pdf)

29. [Uploading: A Philosophical Analysis. David J. Chalmers (standard reference on gradual uploading).](https://stafforini.com/pdfs/chalmers-2014-uploading-philosophical-analysis.pdf)