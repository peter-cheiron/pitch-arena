import { Injectable } from "@angular/core";

import { getApp } from "@angular/fire/app";
import { Timestamp } from "@angular/fire/firestore";

@Injectable({
  providedIn: "root",
})
/**
 * This is now too large and confusing split it into meaningful services.
 * - naming
 * - preview
 * - other stuff
 */
export class UtillitiesService {

  static formatAsString(obj) {
    return this.objectToChunkText(this.replaceNulls(obj));
  }

  /**
   * checks all values for an object to ensure that there are no nulls or undefineds
   * which pinecone doesn't support
   *
   * @param obj the objec to check
   * @returns
   */
  static replaceNulls(obj) {
    const cleaned = {};
    for (const key in obj) {
      if (obj[key] === null) {
        cleaned[key] = "";
      } else if (
        typeof obj[key] === "object" &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        cleaned[key] = this.replaceNulls(obj[key]); // recursive for nested objects
      } else {
        cleaned[key] = obj[key];
      }
    }
    return cleaned;
  }

  /**
   * This function converts an object into a document of a boring type:
   *
   * key: value
   * another: value
   *
   * @param obj the obj to write
   * @returns a sort of document
   */
  static objectToChunkText(obj: Record<string, any>): string {
    return Object.entries(obj)
      .filter(([_, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${this.formatKey(key)}: ${value}`)
      .join("\n");
  }

  static justValues(
    obj: Record<string, any>,
    ignoreFields: string[] = []
  ): string {
    return Object.entries(obj)
      .filter(([_, value]) => value !== null && value !== undefined)
      .filter(([key, _]) => !ignoreFields.includes(key))
      .filter(([_, value]) => value !== true || value !== false)
      .map(([_, value]) => `${value}`)
      .join(", ");
  }

  /**
   * Optional helper to format camelCase/snake_case to nice titles
   * */
  static formatKey(key: string): string {
    return key
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

    // ---- date helpers ----
  static toInputDate(d: any): string {
    const js = d instanceof Date ? d
            : (d && typeof d.toDate === 'function') ? (d as Timestamp).toDate()
            : (d ? new Date(d) : null);
    if (!js) return '';
    const y = js.getFullYear();
    const m = String(js.getMonth() + 1).padStart(2, '0');
    const day = String(js.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  static fromInputDate(s: string): Date {
    // interpret as local date at midnight
    return s ? new Date(`${s}T00:00:00`) : new Date();
  }
}