export function groupQuestionsByPage(questions) {
  const pagesByOrder = new Map()
  for (const question of questions) {
    const orderPage = question.orderPage || 1
    if (!pagesByOrder.has(orderPage)) {
      pagesByOrder.set(orderPage, {
        orderPage,
        categorie: question.categorie || null,
        sousCategorie: question.sousCategorie || null,
        questions: [],
      })
    }
    pagesByOrder.get(orderPage).questions.push(question)
  }

  return Array.from(pagesByOrder.values())
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
