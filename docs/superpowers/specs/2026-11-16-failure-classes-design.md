# Failure classes

Date: 2026-11-16

## Purpose

An organization keeps one shared catalog of how equipment can fail. An asset, and an operating location, each point at one failure class in that catalog. The asset's class is the one that applies. The location's class applies only when the asset has none.

The equipment classification stays a separate fact. Classifying a pump as centrifugal does not assign a failure class, and assigning a failure class does not change the classification.

This version does not record which problem, cause, or remedy occurred. That record belongs on a job and is a later pass.

## Catalog

The catalog is scoped to an organization.

A failure code is a short code plus a description, unique within the organization. The same code can be placed in more than one spot in the tree. LEAK can be a problem under Pumps and a problem under Valves, with one shared description.

The tree has four fixed levels, and only those levels:

1. Class. No parent. Example: PUMPS, Pumps.
2. Problem. Parent is a class. Example: LEAK, Leaking.
3. Cause. Parent is a problem. Example: SEAL, Seal wear.
4. Remedy. Parent is a cause. Example: REPL, Replaced seal.

A class cannot contain a cause or a remedy directly. A problem cannot contain another problem. Nothing sits under a remedy.

The description belongs to the code. Changing it changes that text everywhere the code is placed. Removing a placement does not delete the code. A code with no placements left can be deleted. A code that is still placed cannot.

## Pointers

An asset stores an optional failure class. The class must belong to the asset's organization, and the chosen node must be a class, not a problem, cause, or remedy.

A location stores an optional failure class under the same rules, and only when the location type is OPERATING. A storeroom, salvage, holding, vendor, or repair location cannot store one. Changing a location away from OPERATING clears its failure class.

Either pointer can be set, changed, or cleared. Clearing it does not change the catalog.

A class that an asset or a location still uses cannot be deleted. A code that is still placed in the tree cannot be deleted. Removing a class removes its problems, causes, and remedies. Removing a problem removes its causes and remedies. Removing a cause removes its remedies.

## Which class applies

Given an asset and the location on that asset:

- Use the asset's failure class when it has one.
- Otherwise use the location's failure class when that location is OPERATING and has one.
- Otherwise no class applies.

The asset screen shows the asset's own pointer as an editable field. When that field is empty and the asset's location supplies a class, the screen shows that class as the one that applies, and it is not editable there. The user changes it on the location, or sets a class on the asset.

Changing the equipment classification does not read or write the failure class.

## Screen

Failure codes sit in the asset area, beside Classifications. The person picks an organization, then sees its classes. Selecting a class shows its problems. Selecting a problem shows its causes. Selecting a cause shows its remedies. They can add, rename the description, and remove nodes, subject to the delete rules above.

The asset editor and the location editor each gain a Failure class field. The location field is shown only for an operating location. The list offers classes from that organization and no other nodes.

## Out of scope

- Recording a problem, cause, or remedy on a work order, incident, or any other entity.
- Copying the class onto a job.
- A warning when two open jobs share the same asset and problem.
- Building the failure class from the equipment classification.
- Copying a hierarchy from one class or one organization to another.
- More than the four levels, or renamed level types.
- Translations of a description.
- Sample failure classes for Mitarsh or any other organization.

## Checks

- A class, problem, cause, and remedy can be created in order.
- A cause cannot be added directly under a class.
- The same code can be placed under two classes.
- An asset can store a class from its organization and cannot store a problem code or a class from another organization.
- An operating location can store a class. Another location type cannot.
- Changing a location away from OPERATING clears the class.
- A class that is still used cannot be deleted.
- With an asset class and a location class both set, the asset class is the one that applies.
- With only the location class set, that class applies.
- With neither set, no class applies.
- Changing the equipment classification leaves the failure class as it was.
