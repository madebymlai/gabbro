# Coding Principles

Enforcer validates code and designs against these principles. Each entry is a rule and a set of concrete questions to ask when checking conformance.

---

## SOLID

### Single Responsibility (SRP)
**Rule:** One module, one reason to change.

Ask:
- Can I describe this module's purpose without using "and"?
- What is the single reason this module would need to change?
- Does this file mix unrelated concerns (e.g. parsing + persistence + formatting)?
- If I rename this module to match what it does, does the name fit in under five words?
- Are there two groups of functions here that never call each other?

### Open/Closed (OCP)
**Rule:** Extend behavior without modifying existing code.

Ask:
- Can I add this behavior without changing existing code?
- Am I editing a switch/if-else chain to add this?
- Is there a growing `if type == ...` ladder that a polymorphic dispatch would eliminate?
- Does adding a new variant require edits in more than one file?
- Am I modifying stable code instead of plugging into an extension point?

### Liskov Substitution (LSP)
**Rule:** Implementations are interchangeable.

Ask:
- Would swapping this implementation break callers?
- Does this implementation honor all contracts of the interface?
- Does this override throw `NotImplementedError` or silently no-op?
- Does this subclass strengthen preconditions or weaken postconditions?
- Do callers have to check the concrete type to know what they can do?

### Interface Segregation (ISP)
**Rule:** Small, focused interfaces.

Ask:
- Does this class use every method it's forced to implement?
- Would a new implementation need to stub out methods?
- Is this interface a grab-bag that no single consumer uses fully?
- Could this one big interface be split into two smaller ones that don't overlap?
- Are callers depending on methods they don't actually call?

### Dependency Inversion (DIP)
**Rule:** Depend on abstractions, never concrete implementations.

Ask:
- Am I importing a concrete class or an interface?
- Can I swap this dependency without changing this file?
- Is high-level policy importing low-level detail modules directly?
- Is this dependency constructed inside the class instead of injected?
- Would testing this require mocking a concrete library instead of an interface?

---

## KISS & DRY

### KISS
**Rule:** Simplest solution that works. Boring code is good code.

Ask:
- Is there a simpler way to do this?
- Would a junior developer understand this immediately?
- Am I adding abstraction for a second use case that doesn't exist yet?
- Is this clever one-liner replaceable with three clear lines?
- Am I using a framework feature where a plain function would do?
- Does this solve a problem I actually have, or one I might have?

### DRY
**Rule:** If you write the same logic twice, extract it.

Ask:
- Have I written this pattern elsewhere in the codebase?
- Would changing this require updating multiple places?
- Are these two blocks duplicates, or do they only look similar (coincidental duplication)?
- Is the shared concept real, or am I forcing an abstraction over unrelated code?
- If the rule behind this duplication changes, will all copies need to change together?

---

## No Defensive Garbage

### No Defensive Garbage
**Rule:** Let bugs surface, don't hide them. Trust contracts.

Ask:
- Am I adding a fallback that hides bugs instead of surfacing them?
- Is this try/catch swallowing errors silently?
- Am I writing null checks everywhere instead of fixing the source?
- Does this "safe" default make debugging impossible?
- Is this a dead branch that never executes but adds cognitive load?
- Am I validating input that has already been validated upstream?
- Is this check protecting against a case that can't actually happen?
- Would removing this guard make a real bug louder and easier to find?

---

## Composition & Types

### Composition over Inheritance
**Rule:** Combine behaviors, don't extend them. No hierarchies deeper than 2.

Ask:
- Am I inheriting just to reuse code?
- Is this class hierarchy deeper than 2 levels?
- Could this be a field (has-a) instead of a parent (is-a)?
- Does the subclass override more than it extends?
- Am I using inheritance to share implementation rather than to model a real subtype relationship?

### Make Invalid States Unrepresentable
**Rule:** Use the type system. Enums over flags. If it compiles, it's valid.

Ask:
- Can this be represented as one discriminated union instead of multiple booleans?
- Would adding a new state require changing conditionals in many places?
- Are there combinations of these fields that should never coexist but currently can?
- Am I using a string where an enum would prevent typos at compile time?
- Does the type allow `null` in a place where `null` is never valid?
- Can I push this runtime check into the type system?

### Tell, Don't Ask
**Rule:** Put behavior where the data lives.

Ask:
- Am I inspecting data to decide behavior instead of delegating it?
- Am I reaching through an object to touch its internals?
- Would this logic be shorter if it lived on the object being inspected?
- Is the caller making decisions that only the owner of the data should make?
