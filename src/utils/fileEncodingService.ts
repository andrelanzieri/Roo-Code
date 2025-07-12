import * as path from "path"
import * as fs from "fs/promises"

/**
 * Serviço para gerenciar mapeamento de extensões de arquivo para encodings específicos
 */
export class FileEncodingService {
	private static encodingMap: Record<string, string> = {}

	/**
	 * Atualiza o mapeamento de extensões para encodings
	 */
	static updateEncodingMap(encodingMap: Record<string, string> = {}): void {
		this.encodingMap = { ...encodingMap }
	}

	/**
	 * Obtém o encoding para uma extensão específica
	 */
	static getEncodingForExtension(extension: string): string {
		// Normaliza a extensão (remove o ponto se presente e converte para minúsculo)
		const normalizedExt = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`
		const configuredEncoding = this.encodingMap[normalizedExt] || "utf8"

		// Node.js não suporta 'win1252' nativamente, mas latin1 é equivalente para a maioria dos casos
		return configuredEncoding === "win1252" ? "latin1" : configuredEncoding
	}

	/**
	 * Obtém o encoding para um arquivo baseado em seu caminho
	 */
	static getEncodingForFile(filePath: string): string {
		const extension = path.extname(filePath).toLowerCase()
		return this.getEncodingForExtension(extension)
	}

	/**
	 * Verifica se uma extensão tem encoding configurado
	 */
	static hasCustomEncoding(extension: string): boolean {
		const normalizedExt = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`
		return normalizedExt in this.encodingMap
	}

	/**
	 * Obtém o mapeamento completo de encodings
	 */
	static getEncodingMap(): Record<string, string> {
		return { ...this.encodingMap }
	}

	/**
	 * Remove uma extensão do mapeamento
	 */
	static removeExtension(extension: string): void {
		const normalizedExt = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`
		delete this.encodingMap[normalizedExt]
	}

	/**
	 * Adiciona ou atualiza uma extensão no mapeamento
	 */
	static setEncodingForExtension(extension: string, encoding: string): void {
		const normalizedExt = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`
		this.encodingMap[normalizedExt] = encoding
	}

	/**
	 * Lista de encodings comuns suportados
	 */
	static getSupportedEncodings(): string[] {
		return [
			"utf8",
			"utf16le",
			"utf16be",
			"ascii",
			"latin1",
			"binary",
			"hex",
			"base64",
			"win1252",
			"windows-1251",
			"iso-8859-1",
			"iso-8859-2",
			"iso-8859-3",
			"iso-8859-4",
			"iso-8859-5",
			"iso-8859-6",
			"iso-8859-7",
			"iso-8859-8",
			"iso-8859-9",
			"iso-8859-10",
			"iso-8859-11",
			"iso-8859-13",
			"iso-8859-14",
			"iso-8859-15",
			"iso-8859-16",
		]
	}

	/**
	 * Valida se um encoding é suportado
	 */
	static isValidEncoding(encoding: string): boolean {
		try {
			// Node.js trata win1252 como latin1
			const actualEncoding = encoding === "win1252" ? "latin1" : encoding
			// Testa se o Node.js suporta o encoding tentando criar um buffer
			Buffer.from("test", actualEncoding as BufferEncoding)
			return true
		} catch {
			return false
		}
	}

	/**
	 * Detecta possíveis problemas de encoding em um buffer de arquivo
	 * Retorna null se não há problemas detectados, ou uma string com o problema identificado
	 */
	static detectEncodingIssues(buffer: Buffer, currentEncoding: string = "utf8"): string | null {
		try {
			const content = buffer.toString(currentEncoding as BufferEncoding)

			// Verifica caracteres de substituição Unicode (indicam problemas de encoding)
			if (content.includes("\uFFFD")) {
				return "Caracteres de substituição Unicode detectados - arquivo pode estar usando encoding diferente"
			}

			// Verifica padrões típicos de Windows-1252 mal interpretado como UTF-8
			const win1252Indicators = [
				"\u00C0",
				"\u00C1",
				"\u00C2",
				"\u00C3", // À Á Â Ã mal interpretados
				"\u00E7",
				"\u00E3",
				"\u00F5",
				"\u00E1", // ç ã õ á mal interpretados
				"\u00C7",
				"\u00C3\u00A7",
				"\u00C3\u00A3", // Ç mal interpretado, sequências típicas
			]

			const hasWin1252Indicators = win1252Indicators.some((indicator) => content.includes(indicator))

			if (hasWin1252Indicators && currentEncoding === "utf8") {
				return "Possível arquivo Windows-1252 sendo lido como UTF-8 - considere configurar encoding para 'win1252'"
			}

			// Verifica bytes de alta ordem que podem indicar encoding não-UTF8
			const hasHighBytes = Array.from(buffer).some((byte) => byte > 127 && byte < 160)
			if (hasHighBytes && currentEncoding === "utf8") {
				return "Detectados bytes característicos de encoding não-UTF8 - arquivo pode precisar de encoding específico"
			}

			return null
		} catch (error) {
			return `Erro ao verificar encoding: ${error instanceof Error ? error.message : String(error)}`
		}
	}

	/**
	 * Sugere encodings alternativos baseado no conteúdo do arquivo
	 */
	static suggestEncodingForFile(filePath: string, buffer: Buffer): string[] {
		const suggestions: string[] = []
		const extension = path.extname(filePath).toLowerCase()

		// Sugestões baseadas na extensão do arquivo
		const commonMappings: Record<string, string[]> = {
			".prw": ["win1252", "latin1"],
			".tlpp": ["win1252", "latin1"],
			".txt": ["win1252", "latin1", "iso-8859-1"],
			".ch": ["win1252", "latin1"],
			".asm": ["win1252", "latin1"],
			".pas": ["win1252", "latin1"],
			".dpr": ["win1252", "latin1"],
			".sql": ["win1252", "latin1", "iso-8859-1"],
		}

		if (commonMappings[extension]) {
			suggestions.push(...commonMappings[extension])
		}

		// Análise heurística do conteúdo
		try {
			// Tenta decodificar como Windows-1252 e verifica se melhora
			const asWin1252 = buffer.toString("latin1") // Node.js usa latin1 para simular win1252
			if (!asWin1252.includes("\uFFFD") && asWin1252.length > 0) {
				if (!suggestions.includes("win1252")) {
					suggestions.push("win1252")
				}
			}
		} catch (error) {
			// Ignora erros de decodificação
		}

		// Se não há sugestões específicas, adiciona opções comuns
		if (suggestions.length === 0) {
			suggestions.push("win1252", "latin1", "iso-8859-1")
		}

		return suggestions
	}

	/**
	 * Tenta ler um arquivo com diferentes encodings e retorna o melhor resultado
	 */
	static async tryReadWithEncodings(
		filePath: string,
		encodings: string[] = ["utf8", "win1252", "latin1"],
	): Promise<{
		content: string
		encoding: string
		issues: string | null
	}> {
		const buffer = await fs.readFile(filePath)

		for (const encoding of encodings) {
			try {
				// Node.js trata win1252 como latin1
				const actualEncoding = encoding === "win1252" ? "latin1" : encoding
				const content = buffer.toString(actualEncoding as BufferEncoding)
				const issues = this.detectEncodingIssues(buffer, encoding) // Usa o encoding original para detecção

				// Se não há problemas detectados, retorna este resultado
				if (!issues) {
					return { content, encoding, issues: null }
				}
			} catch (error) {
				// Continua para o próximo encoding
				continue
			}
		}

		// Se nenhum encoding funcionou perfeitamente, retorna o primeiro com detalhes do problema
		const firstEncoding = encodings[0] || "utf8"
		const actualFirstEncoding = firstEncoding === "win1252" ? "latin1" : firstEncoding
		const content = buffer.toString(actualFirstEncoding as BufferEncoding)
		const issues = this.detectEncodingIssues(buffer, firstEncoding)

		return { content, encoding: firstEncoding, issues }
	}

	/**
	 * Gera sugestões de configuração baseadas nos problemas detectados
	 */
	static generateConfigSuggestion(filePath: string, detectedIssues: string): string {
		const extension = path.extname(filePath).toLowerCase()
		const suggestions = this.suggestEncodingForFile(filePath, Buffer.alloc(0)) // Buffer vazio para sugestões baseadas apenas na extensão

		const primarySuggestion = suggestions[0] || "win1252"

		return `Para resolver problemas de encoding com arquivos ${extension}, tente configurar o encoding nas configurações do Roo:
1. Abra as Configurações do Roo
2. Na seção "Configurações de Arquivo" > "Encoding de Arquivo"
3. Adicione: extensão "${extension}" → encoding "${primarySuggestion}"

Ou adicione esta configuração diretamente:
{ "${extension}": "${primarySuggestion}" }`
	}
}
