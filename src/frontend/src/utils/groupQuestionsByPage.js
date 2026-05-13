// Regroupe les questions par sous-catégorie : chaque sous-catégorie = 1 page.
// Fallback sur `orderPage` lorsque la question n'a pas encore de sousCategorieId.
export function groupQuestionsByPage(questions) {
  const pagesByKey = new Map()
  for (const question of questions) {
    const key = question.sousCategorieId
      ? `sub:${question.sousCategorieId}`
      : `page:${question.orderPage || 1}`
    if (!pagesByKey.has(key)) {
      pagesByKey.set(key, {
        key,
        orderPage: question.orderPage || 1,
        categorie: question.categorie || null,
        sousCategorie: question.sousCategorie || null,
        questions: [],
      })
    } else {
      const page = pagesByKey.get(key)
      // Conserver le plus petit orderPage pour le tri global.
      page.orderPage = Math.min(page.orderPage, question.orderPage || page.orderPage)
    }
    pagesByKey.get(key).questions.push(question)
  }

  return Array.from(pagesByKey.values())
    .sort((a, b) => a.orderPage - b.orderPage)
    .map((page) => ({
      ...page,
      questions: page.questions.sort((a, b) => {
        const aField = Array.isArray(a.crmFieldIds) ? a.crmFieldIds[0] : 0
        const bField = Array.isArray(b.crmFieldIds) ? b.crmFieldIds[0] : 0
        return (a.orderInPage ?? a.ordreDansPage ?? aField) - (b.orderInPage ?? b.ordreDansPage ?? bField)
      }),
    }))
}
