import { WeightAgent } from './weight.agent';
import { AiService } from '../modules/ai/ai.service';

/** AiService falso: devolve o que o teste mandar, sem chamar provedor nenhum. */
function agentReturning(data: unknown): WeightAgent {
  const ai = {
    generateText: jest.fn().mockResolvedValue({
      data,
      usage: { provider: 'fake', model: 'fake', inputTokens: 0, outputTokens: 0 },
    }),
  } as unknown as AiService;
  return new WeightAgent(ai);
}

const VISION = { name: 'Jogo de Copo 320ml', material: 'vidro', quantity: 6 };

describe('WeightAgent', () => {
  it('aceita peso plausível e arredonda para 3 casas', async () => {
    const out = await agentReturning({
      weight: 2.1234,
      reasoning: 'vidro x6',
      confidence: 0.8,
    }).run(VISION);
    expect(out.weight).toBe(2.123);
    expect(out.confidence).toBe(0.8);
  });

  it('aceita número vindo como string (o modelo às vezes devolve "2.1")', async () => {
    const out = await agentReturning({ weight: '2.1', reasoning: '', confidence: 0.5 }).run(VISION);
    expect(out.weight).toBe(2.1);
  });

  // Gravar peso inválido é pior que não gravar: o validador do Shopee barra o
  // produto ausente, mas deixaria passar um peso absurdo → frete errado na venda.
  it.each([
    ['zero', 0],
    ['negativo', -1],
    ['null', null],
    ['ausente', undefined],
    ['texto', 'pesado'],
    ['acima de 100kg (gramas trocadas por kg)', 2100],
  ])('recusa peso %s', async (_label, value) => {
    const out = await agentReturning({ weight: value, reasoning: '', confidence: 0.9 }).run(VISION);
    expect(out.weight).toBeNull();
  });

  it('não estoura quando a IA devolve JSON inválido (data null)', async () => {
    const out = await agentReturning(null).run(VISION);
    expect(out.weight).toBeNull();
    expect(out.confidence).toBe(0);
  });

  it('limita a confiança ao intervalo 0..1', async () => {
    const out = await agentReturning({ weight: 1, reasoning: '', confidence: 7 }).run(VISION);
    expect(out.confidence).toBe(1);
  });

  describe('dimensões', () => {
    const COM_MEDIDAS = {
      weight: 0.35,
      length: 20,
      width: 15,
      height: 8,
      reasoning: '',
      confidence: 0.7,
    };

    it('aceita as três medidas juntas', async () => {
      const out = await agentReturning(COM_MEDIDAS).run(VISION);
      expect(out.dimensions).toEqual({ length: 20, width: 15, height: 8 });
    });

    // A Shopee trata dimensão como conjunto: meia medida faz ela acusar dado
    // incompleto. Melhor devolver nada e deixar o produto pendente.
    it.each(['length', 'width', 'height'])('descarta o conjunto se %s faltar', async (campo) => {
      const parcial = { ...COM_MEDIDAS, [campo]: null };
      const out = await agentReturning(parcial).run(VISION);
      expect(out.dimensions).toBeNull();
      expect(out.weight).toBe(0.35); // o peso sobrevive
    });

    it.each([
      ['zero', 0],
      ['negativa', -5],
      ['acima de 1000cm (mm trocado por cm)', 2000],
    ])('recusa medida %s', async (_label, value) => {
      const out = await agentReturning({ ...COM_MEDIDAS, width: value }).run(VISION);
      expect(out.dimensions).toBeNull();
    });

    it('não quebra quando a IA devolve só o peso', async () => {
      const out = await agentReturning({ weight: 0.35, reasoning: '', confidence: 0.5 }).run(
        VISION,
      );
      expect(out.weight).toBe(0.35);
      expect(out.dimensions).toBeNull();
    });
  });
});
