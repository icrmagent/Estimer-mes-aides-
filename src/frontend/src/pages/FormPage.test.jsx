import { describe, expect, it } from 'vitest'
import { groupQuestionsByPage } from './FormPage.jsx'

describe('groupQuestionsByPage', () => {
  it('affiche une page par sous-categorie avec ses questions relatives triees', () => {
    const questions = [
      {
        id: 'q-heating-other',
        orderPage: 2,
        ordreDansPage: 1,
        libelleQuestion: { fr: 'Autre type de chauffage principal' },
        categorie: { id: 'cat-travaux', nom: 'Le Lieu des Travaux' },
        sousCategorie: { id: 'sub-travaux-7', nom: 'Le lieu des travaux 7/7' },
      },
      {
        id: 'q-owner',
        orderPage: 1,
        ordreDansPage: 0,
        libelleQuestion: { fr: 'Dans ce logement vous etes' },
        categorie: { id: 'cat-info', nom: 'Informations Personnelles' },
        sousCategorie: { id: 'sub-info-3', nom: 'Information Personnelle 3/3' },
      },
      {
        id: 'q-heating-main',
        orderPage: 2,
        ordreDansPage: 0,
        libelleQuestion: { fr: 'Type de chauffage principal' },
        categorie: { id: 'cat-travaux', nom: 'Le Lieu des Travaux' },
        sousCategorie: { id: 'sub-travaux-7', nom: 'Le lieu des travaux 7/7' },
      },
    ]

    const pages = groupQuestionsByPage(questions)

    expect(pages).toHaveLength(2)
    expect(pages[0].sousCategorie.nom).toBe('Information Personnelle 3/3')
    expect(pages[0].questions.map((question) => question.id)).toEqual(['q-owner'])

    expect(pages[1].sousCategorie.nom).toBe('Le lieu des travaux 7/7')
    expect(pages[1].questions.map((question) => question.id)).toEqual([
      'q-heating-main',
      'q-heating-other',
    ])
  })
})
