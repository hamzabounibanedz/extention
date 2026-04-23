/**
 * @fileoverview Workspace add-on homepage (CardService) required by appsscript.json addOns.
 * The real UI remains HtmlService in Menu.gs; this card only satisfies the manifest and guides users.
 */

/**
 * Homepage for the add-on side panel (Google Workspace add-ons require a Card-returning trigger).
 * @param {Object} e
 * @return {GoogleAppsScript.Card.Card[]}
 */
function addon_onHomepage(e) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Delivery Tool'))
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText(
          'Extensions → Delivery Tool → Open sidebar. You can also use the Delivery Tool menu on the toolbar if it appears there.',
        ),
      ),
    )
    .build();
  return [card];
}
