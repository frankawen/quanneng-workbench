const AGNES_API_KEY = import.meta.env.VITE_AGNES_API_KEY
const AGNES_API_URL = import.meta.env.VITE_AGNES_API_URL

interface RecognitionResult {
  data: {
    choices: Array<{
      message: {
        content: string
      }
    }>
  }
}

export async function recognizeImage(base64Image: string): Promise<RecognitionResult | null> {
  try {
    const response = await fetch(`${AGNES_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AGNES_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'agnes-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请识别这张图片中的商品，告诉我商品名称和大概价格。只输出商品名称和价格信息。'
              },
              {
                type: 'image_url',
                image_url: {
                  url: base64Image
                }
              }
            ]
          }
        ],
        max_tokens: 300
      })
    })

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('识图API调用失败:', error)
    return null
  }
}
