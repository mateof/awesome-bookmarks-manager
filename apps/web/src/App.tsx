import { Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./auth.js";
import { DialogProvider } from "./components/dialogs.js";
import { Layout } from "./components/Layout.js";
import { useSelectAllOnFirstClick } from "./lib/selectAllOnFirstClick.js";
import { BookmarkDetailPage } from "./pages/BookmarkDetailPage.js";
import { DuplicatesPage } from "./pages/DuplicatesPage.js";
import { FolderPage } from "./pages/FolderPage.js";
import { GroupsPage } from "./pages/GroupsPage.js";
import { InvitePage } from "./pages/InvitePage.js";
import { LinkedSharePage } from "./pages/LinkedSharePage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { PanelsPage } from "./pages/PanelsPage.js";
import { PublicPanelPage } from "./pages/PublicPanelPage.js";
import { SearchPage } from "./pages/SearchPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { SharedBookmarkPage } from "./pages/SharedBookmarkPage.js";
import { SharedPage } from "./pages/SharedPage.js";
import { SharePage } from "./pages/SharePage.js";
import { ShareTargetPage } from "./pages/ShareTargetPage.js";
import { SignupPage } from "./pages/SignupPage.js";
import {
  SmartFolderPage,
  TagFilterPage,
  TagRedirectPage,
} from "./pages/TagFilterPage.js";
import { TagsPage } from "./pages/TagsPage.js";
import { TrashPage } from "./pages/TrashPage.js";

export default function App() {
  useSelectAllOnFirstClick();
  return (
    <DialogProvider>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/panel/:slug" element={<PublicPanelPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/" element={<FolderPage />} />
                  <Route path="/folder/:id" element={<FolderPage />} />
                  <Route path="/linked/:folderId" element={<LinkedSharePage />} />
                  <Route path="/bookmark/:id" element={<BookmarkDetailPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/groups" element={<GroupsPage />} />
                  <Route path="/groups/:id" element={<GroupsPage />} />
                  <Route path="/shared" element={<SharedPage />} />
                  <Route path="/shared/:shareId" element={<SharedPage />} />
              <Route
                path="/shared/:shareId/bookmark/:nodeId"
                element={<SharedBookmarkPage />}
              />
                  <Route path="/panels" element={<PanelsPage />} />
                  <Route path="/tags" element={<TagsPage />} />
                  <Route path="/filter" element={<TagFilterPage />} />
                  <Route path="/smart/:id" element={<SmartFolderPage />} />
                  <Route path="/tag/:id" element={<TagRedirectPage />} />
                  <Route path="/duplicates" element={<DuplicatesPage />} />
                  <Route path="/trash" element={<TrashPage />} />
                  {/* Landing spot for the OS share sheet (see the manifest). */}
                  <Route path="/share-target" element={<ShareTargetPage />} />
                  <Route path="/settings/*" element={<SettingsPage />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
    </DialogProvider>
  );
}
