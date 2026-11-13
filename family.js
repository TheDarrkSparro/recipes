/* Family album photos.
   Newest first. The first photo with feature: true (or the first photo, if
   none has it) also appears on the home page beside the search box.

   To add a photo:
   1. Put the image in img/family/ (a JPG about 1200 to 1600 pixels wide).
   2. Copy one of the objects below to the top of the list and change it.
      width and height are the image's real size in pixels; they keep the
      page from jumping while the photo loads.
   3. Raise the number in family.js?v=1 in index.html.
*/
window.FAMILY_PHOTOS = [
  {
    src: "img/family/family-portrait-01.jpg",
    width: 1152,
    height: 738,
    alt: "Colorized studio portrait of a family: a father and mother seated with five young children, a girl with a bow in her hair, a toddler on each parent's lap, a small boy in the middle, and an older boy standing at the right.",
    caption: "The family, years ago. Colorized from the original print.",
    feature: true
  }
];
