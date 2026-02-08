import { Injectable } from "@angular/core";
import type { Profile } from "src/app/standard/user/models/profile";
import { DbInstanceService } from "./db-instance.service";

@Injectable({
  providedIn: "root",
})
//TODO one day name this as profile service as its annoying
export class DbUserService extends DbInstanceService<Profile> {

  constructor() {
    super();
    this.collectionName = "users";
  }

}
