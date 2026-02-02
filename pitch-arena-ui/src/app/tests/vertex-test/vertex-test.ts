
import { Component, inject } from '@angular/core';
import { VertexAI, getGenerativeModel } from '@angular/fire/vertexai';


@Component({
  selector: 'app-vertex-test',
  imports: [],
  templateUrl: './vertex-test.html',
  styleUrl: './vertex-test.css',
})
export class VertexTest {
  private vertexAI = inject(VertexAI);

  async generateWithThinking() {
    const model = getGenerativeModel(this.vertexAI, {
      model: 'gemini-3-flash-preview',
      generationConfig: {
        // For Gemini 3, thinkingLevel is the recommended way to control reasoning
        // Options: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'
        thinkingLevel: 'MEDIUM' 
      } as any
    });

    const result = await model.generateContent('Solve this complex logic puzzle...');
    console.log(result.response.text());
  }
}
