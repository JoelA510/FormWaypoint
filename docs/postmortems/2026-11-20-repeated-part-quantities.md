# Repeated parts showed only their last invoice quantity

The review screen understated the quantity of a part appearing on multiple invoice lines. The commodity rows already included every selected line. A map used to pick one description and one set of override controls per part also picked a single line's quantity. On formats that use saved unit weights, the displayed kilograms covered only that line too.

The panel now groups the reconciled lines by part, sums quantities within each invoice unit, and sums the line weights. When the commodity weights disagree with the printed net total, the footer shows the document total beside their sum. Assigning a shipment-level difference to individual commodities requires additional source information.

A synthetic invoice upload now exercises the path from parsing through the review table. Component tests cover repeated parts, equivalent and incompatible units, and the per-part kilogram subtotal.
